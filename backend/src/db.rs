//! Per-user PostgreSQL persistence, independent of HTTP and authentication.
use crate::planner::{ValidationError, validate_document};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{AssertSqlSafe, PgPool, postgres::PgPoolOptions};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

const MAX_CONNECTIONS: u32 = 5;
const STATEMENT_TIMEOUT: &str = "5s";
const PLANNER_COLUMNS: &str = "document, revision, updated_at";

#[derive(Clone)]
pub struct Database {
    pub(crate) pool: PgPool,
}

#[derive(Debug, sqlx::FromRow, Serialize, PartialEq)]
pub struct StoredPlanner {
    pub document: Value,
    pub revision: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, sqlx::FromRow, Serialize, PartialEq)]
pub struct SavedPlanner {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub document: Option<Value>,
    pub revision: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug)]
pub enum SaveError {
    Invalid(ValidationError),
    Conflict,
    Database(sqlx::Error),
}
impl std::fmt::Display for SaveError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            Self::Invalid(e) => write!(f, "{e}"),
            Self::Conflict => f.write_str("Planner revision conflict"),
            Self::Database(_) => f.write_str("Planner database operation failed"),
        }
    }
}
impl std::error::Error for SaveError {}
impl From<sqlx::Error> for SaveError {
    fn from(e: sqlx::Error) -> Self {
        Self::Database(e)
    }
}

impl Database {
    pub async fn connect(url: &str) -> Result<Self, sqlx::Error> {
        let pool = PgPoolOptions::new()
            .max_connections(MAX_CONNECTIONS)
            .acquire_timeout(std::time::Duration::from_secs(3))
            .after_connect(|connection, _| {
                Box::pin(async move {
                    sqlx::query("SELECT set_config('statement_timeout', $1, false)")
                        .bind(STATEMENT_TIMEOUT)
                        .execute(connection)
                        .await?;
                    Ok(())
                })
            })
            .connect(url)
            .await?;
        Ok(Self { pool })
    }
    pub fn from_pool(pool: PgPool) -> Self {
        Self { pool }
    }
    pub async fn migrate(&self) -> Result<(), sqlx::migrate::MigrateError> {
        MIGRATOR.run(&self.pool).await
    }
    pub async fn close(&self) {
        self.pool.close().await;
    }
    /// Identity values come from a verified OIDC identity, never a request body.
    pub async fn ensure_user(&self, issuer: &str, subject: &str) -> Result<i64, sqlx::Error> {
        sqlx::query_scalar(
            "INSERT INTO users (oidc_issuer, oidc_subject)
             VALUES ($1, $2)
             ON CONFLICT (oidc_issuer, oidc_subject)
             DO UPDATE SET oidc_subject = EXCLUDED.oidc_subject
             RETURNING id",
        )
        .bind(issuer)
        .bind(subject)
        .fetch_one(&self.pool)
        .await
    }
    pub async fn load(&self, user_id: i64) -> Result<Option<StoredPlanner>, sqlx::Error> {
        // Only the compile-time column constant enters SQL; user_id stays bound.
        sqlx::query_as(AssertSqlSafe(format!(
            "SELECT {PLANNER_COLUMNS} FROM planners WHERE user_id = $1"
        )))
        .bind(user_id)
        .fetch_optional(&self.pool)
        .await
    }
    /// Zero creates a planner; positive revisions conditionally replace one.
    /// PostgreSQL serializes conflicting inserts/updates and rechecks the predicate.
    pub async fn save(
        &self,
        user_id: i64,
        document: &Value,
        expected_revision: i64,
    ) -> Result<SavedPlanner, SaveError> {
        self.save_with_echo(user_id, document, expected_revision, false)
            .await
    }
    /// Echo the stored JSONB only for explicit migration confirmation.
    pub async fn save_with_echo(
        &self,
        user_id: i64,
        document: &Value,
        expected_revision: i64,
        echo_document: bool,
    ) -> Result<SavedPlanner, SaveError> {
        validate_document(document).map_err(SaveError::Invalid)?;
        if expected_revision < 0 {
            return Err(SaveError::Invalid(ValidationError(
                "Expected revision must be nonnegative".into(),
            )));
        }
        // Both projections are fixed SQL literals. All request values stay bound
        // below; no identifiers or SQL fragments come from the document/user.
        let columns = if echo_document {
            PLANNER_COLUMNS
        } else {
            "NULL::jsonb AS document, revision, updated_at"
        };
        let saved = if expected_revision == 0 {
            sqlx::query_as(AssertSqlSafe(format!(
                "INSERT INTO planners (user_id, document)
                 VALUES ($1, $2)
                 ON CONFLICT (user_id) DO NOTHING
                  RETURNING {columns}"
            )))
            .bind(user_id)
            .bind(document)
            .fetch_optional(&self.pool)
            .await?
        } else {
            sqlx::query_as(AssertSqlSafe(format!(
                "UPDATE planners
                 SET document = $2, revision = revision + 1, updated_at = clock_timestamp()
                 WHERE user_id = $1 AND revision = $3
                  RETURNING {columns}"
            )))
            .bind(user_id)
            .bind(document)
            .bind(expected_revision)
            .fetch_optional(&self.pool)
            .await?
        };
        saved.ok_or(SaveError::Conflict)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::ConnectOptions;

    #[sqlx::test(migrations = "./migrations")]
    #[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
    async fn runtime_pool_bounds_acquisition_and_cancels_slow_statements(pool: PgPool) {
        let db = Database::connect(pool.connect_options().to_url_lossy().as_str())
            .await
            .unwrap();
        let mut connections = Vec::new();
        for _ in 0..MAX_CONNECTIONS {
            let mut connection = db.pool.acquire().await.unwrap();
            let timeout: String = sqlx::query_scalar("SHOW statement_timeout")
                .fetch_one(&mut *connection)
                .await
                .unwrap();
            assert_eq!(timeout, STATEMENT_TIMEOUT);
            connections.push(connection);
        }
        let start = std::time::Instant::now();
        assert!(matches!(db.load(1).await, Err(sqlx::Error::PoolTimedOut)));
        assert!(start.elapsed() < std::time::Duration::from_secs(5));
        drop(connections);
        let error = sqlx::query("SELECT pg_sleep(10)")
            .execute(&db.pool)
            .await
            .unwrap_err();
        assert_eq!(
            error.as_database_error().unwrap().code().as_deref(),
            Some("57014")
        );
        assert_eq!(
            sqlx::query_scalar::<_, i32>("SELECT 1")
                .fetch_one(&db.pool)
                .await
                .unwrap(),
            1
        );
        db.close().await;
    }
}
