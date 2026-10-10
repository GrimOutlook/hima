//! Per-user PostgreSQL persistence, independent of HTTP and authentication.
use crate::planner::{ValidationError, validate_document};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::{PgPool, postgres::PgPoolOptions};

pub static MIGRATOR: sqlx::migrate::Migrator = sqlx::migrate!("./migrations");

#[derive(Clone)]
pub struct Database {
    pub(crate) pool: PgPool,
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
        for _ in 0..5 {
            let mut connection = db.pool.acquire().await.unwrap();
            let timeout: String = sqlx::query_scalar("SHOW statement_timeout")
                .fetch_one(&mut *connection)
                .await
                .unwrap();
            assert_eq!(timeout, "5s");
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

#[derive(Debug, sqlx::FromRow, Serialize, PartialEq)]
pub struct StoredPlanner {
    pub document: Value,
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
            .max_connections(5)
            .acquire_timeout(std::time::Duration::from_secs(3))
            .after_connect(|connection, _| {
                Box::pin(async move {
                    sqlx::query("SET statement_timeout = '5s'")
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
        sqlx::query_scalar("INSERT INTO users (oidc_issuer, oidc_subject) VALUES ($1, $2) ON CONFLICT (oidc_issuer, oidc_subject) DO UPDATE SET oidc_subject = EXCLUDED.oidc_subject RETURNING id")
            .bind(issuer).bind(subject).fetch_one(&self.pool).await
    }
    pub async fn load(&self, user_id: i64) -> Result<Option<StoredPlanner>, sqlx::Error> {
        sqlx::query_as("SELECT document, revision, updated_at FROM planners WHERE user_id = $1")
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
    ) -> Result<StoredPlanner, SaveError> {
        validate_document(document).map_err(SaveError::Invalid)?;
        if expected_revision < 0 {
            return Err(SaveError::Invalid(ValidationError(
                "Expected revision must be nonnegative".into(),
            )));
        }
        let saved = if expected_revision == 0 {
            sqlx::query_as("INSERT INTO planners (user_id, document) VALUES ($1, $2) ON CONFLICT (user_id) DO NOTHING RETURNING document, revision, updated_at")
                .bind(user_id).bind(document).fetch_optional(&self.pool).await?
        } else {
            sqlx::query_as("UPDATE planners SET document = $2, revision = revision + 1, updated_at = clock_timestamp() WHERE user_id = $1 AND revision = $3 RETURNING document, revision, updated_at")
                .bind(user_id).bind(document).bind(expected_revision).fetch_optional(&self.pool).await?
        };
        saved.ok_or(SaveError::Conflict)
    }
}
