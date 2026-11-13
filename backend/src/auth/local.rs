//! Optional admin-managed local accounts. No registration or email-based linking.
use super::*;
use argon2::{Argon2, PasswordHash, PasswordHasher, PasswordVerifier, password_hash::SaltString};
use tokio::sync::Semaphore;

const LOCAL_ISSUER: &str = "urn:hima:local";
const MAX_PASSWORD: usize = 1024;

pub(super) struct Local {
    workers: Arc<Semaphore>,
    dummy: String,
}

pub fn normalize_username(value: &str) -> Result<String, String> {
    let value = value.to_ascii_lowercase();
    if !(3..=64).contains(&value.len())
        || !value.as_bytes()[0].is_ascii_alphanumeric()
        || !value
            .bytes()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || b"_.-".contains(&c))
    {
        return Err(
            "Username must be 3–64 ASCII letters/digits or _, ., - and start with a letter/digit"
                .into(),
        );
    }
    Ok(value)
}

pub fn validate_password(value: &str) -> Result<(), String> {
    if value.chars().count() < 15 || value.len() > MAX_PASSWORD {
        return Err(
            "Password must contain at least 15 characters and at most 1024 UTF-8 bytes".into(),
        );
    }
    Ok(())
}

pub fn hash_password(value: &str) -> Result<String, String> {
    validate_password(value)?;
    // CsrfToken supplies OS-backed randomness. SaltString encodes the random bytes.
    let salt =
        SaltString::encode_b64(random().as_bytes()).map_err(|_| "Could not generate salt")?;
    Argon2::default()
        .hash_password(value.as_bytes(), &salt)
        .map(|hash| hash.to_string())
        .map_err(|_| "Could not hash password".into())
}

fn verifies(password: &str, encoded: &str) -> bool {
    PasswordHash::new(encoded).is_ok_and(|hash| {
        Argon2::default()
            .verify_password(password.as_bytes(), &hash)
            .is_ok()
    })
}

impl Auth {
    /// Build authentication without any OIDC discovery or client credentials.
    pub async fn new_local(db: Database, origin: &str) -> Result<Arc<Self>, String> {
        let url =
            openidconnect::url::Url::parse(origin).map_err(|_| "Invalid HIMA_PUBLIC_ORIGIN")?;
        if !secure_transport(&url) || url.path() != "/" || url.query().is_some() {
            return Err(
                "HIMA_PUBLIC_ORIGIN must be an HTTPS origin (HTTP allowed only on loopback)".into(),
            );
        }
        let mut auth = Self {
            cleanup_task: Some(spawn_cleanup(db.pool.clone(), CLEANUP_INTERVAL)),
            client: None,
            signing: None,
            local: None,
            http: openidconnect::reqwest::Client::new(),
            db,
            origin: url.origin().ascii_serialization(),
            secure: url.scheme() == "https",
            client_id: String::new(),
            issuer: String::new(),
        };
        auth.local = Some(Local::new().await?);
        Ok(Arc::new(auth))
    }
}

impl Local {
    pub(super) async fn new() -> Result<Self, String> {
        let dummy = tokio::task::spawn_blocking(|| hash_password(&random()))
            .await
            .map_err(|_| "Could not initialize password hashing")??;
        Ok(Self {
            workers: Arc::new(Semaphore::new(2)),
            dummy,
        })
    }
    async fn check(&self, password: String, encoded: String) -> Result<bool, ApiError> {
        let permit = self
            .workers
            .clone()
            .try_acquire_owned()
            .map_err(|_| limited())?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit; // Retained even if the HTTP request is cancelled.
            verifies(&password, &encoded)
        })
        .await
        .auth_unavailable()
    }
    async fn hash(&self, password: String) -> Result<String, ApiError> {
        let permit = self
            .workers
            .clone()
            .try_acquire_owned()
            .map_err(|_| limited())?;
        tokio::task::spawn_blocking(move || {
            let _permit = permit;
            hash_password(&password)
        })
        .await
        .auth_unavailable()?
        .map_err(|_| bad_password())
    }
}

fn limited() -> ApiError {
    ApiError::new(
        StatusCode::TOO_MANY_REQUESTS,
        "login_limited",
        "Too many authentication requests. Try again later.",
    )
}
fn bad_password() -> ApiError {
    ApiError::new(
        StatusCode::BAD_REQUEST,
        "invalid_password",
        "Use at least 15 characters and at most 1024 UTF-8 bytes.",
    )
}
fn credentials() -> ApiError {
    ApiError::new(
        StatusCode::UNAUTHORIZED,
        "invalid_credentials",
        "The username or password is incorrect.",
    )
}
fn require_origin(auth: &Auth, headers: &HeaderMap) -> Result<(), ApiError> {
    if headers.get(header::ORIGIN).and_then(|h| h.to_str().ok()) != Some(&auth.origin) {
        return Err(forbidden());
    }
    Ok(())
}

pub(super) fn router() -> Router<Arc<Auth>> {
    Router::new()
        .route("/auth/options", get(options))
        .route("/auth/local/login", post(login))
        .route("/auth/local/account", get(account))
        .route("/auth/local/password", post(change_password))
        .layer(axum::extract::DefaultBodyLimit::max(8192))
}
async fn options(State(auth): State<Arc<Auth>>) -> Json<serde_json::Value> {
    Json(serde_json::json!({"local": auth.local.is_some(), "oidc": auth.client.is_some()}))
}
async fn account(
    State(auth): State<Arc<Auth>>,
    headers: HeaderMap,
) -> Result<Json<serde_json::Value>, ApiError> {
    let session = auth.session(&headers).await?;
    let local: bool =
        sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM local_credentials WHERE user_id=$1)")
            .bind(session.user_id)
            .fetch_one(&auth.db.pool)
            .await
            .auth_unavailable()?;
    Ok(Json(
        serde_json::json!({"local": auth.local.is_some() && local}),
    ))
}

// Atomic fixed-window admission shared across processes. A single row bounds storage
// even when attackers submit arbitrary usernames. Applies to password changes too.
async fn admit(auth: &Auth) -> Result<(), ApiError> {
    let attempts: i32 = sqlx::query_scalar(
        "INSERT INTO local_login_admission (id,window_start,attempts) VALUES (TRUE,clock_timestamp(),1)
         ON CONFLICT (id) DO UPDATE SET
         attempts = CASE WHEN local_login_admission.window_start <= clock_timestamp()-interval '1 minute' THEN 1 ELSE LEAST(local_login_admission.attempts+1,31) END,
         window_start = CASE WHEN local_login_admission.window_start <= clock_timestamp()-interval '1 minute' THEN clock_timestamp() ELSE local_login_admission.window_start END
         RETURNING attempts")
        .fetch_one(&auth.db.pool).await.auth_unavailable()?;
    if attempts > 30 {
        return Err(limited());
    }
    Ok(())
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Login {
    username: String,
    password: String,
}
async fn login(
    State(auth): State<Arc<Auth>>,
    headers: HeaderMap,
    input: Result<Json<Login>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(input) = input.map_err(|_| credentials())?;
    let local = auth.local.as_ref().ok_or_else(ApiError::auth_unavailable)?;
    require_origin(&auth, &headers)?; // Exact Origin + JSON body prevents login CSRF.
    admit(&auth).await?;
    if input.password.len() > MAX_PASSWORD {
        return Err(credentials());
    }
    let username = normalize_username(&input.username).unwrap_or_default();
    let row: Option<(i64, String)> =
        sqlx::query_as("SELECT user_id,password_hash FROM local_credentials WHERE username=$1")
            .bind(&username)
            .fetch_optional(&auth.db.pool)
            .await
            .auth_unavailable()?;
    let encoded = row
        .as_ref()
        .map(|r| r.1.clone())
        .unwrap_or_else(|| local.dummy.clone());
    let valid = local.check(input.password, encoded.clone()).await?;
    let (user, _) = row.filter(|_| valid).ok_or_else(credentials)?;
    let mut tx = auth.db.pool.begin().await.auth_unavailable()?;
    // Serialize with password reset/change, and reject a verification made stale
    // during hashing. A reset cannot leave a newly minted old-password session.
    let current: String = sqlx::query_scalar(
        "SELECT password_hash FROM local_credentials WHERE user_id=$1 FOR UPDATE",
    )
    .bind(user)
    .fetch_one(&mut *tx)
    .await
    .auth_unavailable()?;
    if current != encoded {
        return Err(credentials());
    }
    if let Some(old) = auth.read_cookie(&headers, CookieKind::Session) {
        delete_session(old)
            .execute(&mut *tx)
            .await
            .auth_unavailable()?;
    }
    let token = random();
    sqlx::query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,clock_timestamp()+$3*interval '1 second')")
        .bind(hash(&token)).bind(user).bind(SESSION_LIFETIME as f64).execute(&mut *tx).await.auth_unavailable()?;
    tx.commit().await.auth_unavailable()?;
    Ok(response(
        &auth,
        "/",
        &[
            (CookieKind::Session, &token, SESSION_LIFETIME),
            (CookieKind::Login, "", 0),
        ],
    ))
}

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct Change {
    current_password: String,
    new_password: String,
}
async fn change_password(
    State(auth): State<Arc<Auth>>,
    Extension(session): Extension<Session>,
    input: Result<Json<Change>, axum::extract::rejection::JsonRejection>,
) -> Result<Response, ApiError> {
    let Json(input) = input.map_err(|_| bad_password())?;
    let local = auth.local.as_ref().ok_or_else(ApiError::auth_unavailable)?;
    admit(&auth).await?;
    if input.current_password.len() > MAX_PASSWORD {
        return Err(credentials());
    }
    validate_password(&input.new_password).map_err(|_| bad_password())?;
    let encoded: Option<String> =
        sqlx::query_scalar("SELECT password_hash FROM local_credentials WHERE user_id=$1")
            .bind(session.user_id)
            .fetch_optional(&auth.db.pool)
            .await
            .auth_unavailable()?;
    let encoded = encoded.ok_or_else(credentials)?;
    if !local.check(input.current_password, encoded.clone()).await? {
        return Err(credentials());
    }
    let replacement = local.hash(input.new_password).await?;
    let mut tx = auth.db.pool.begin().await.auth_unavailable()?;
    let changed = sqlx::query(
        "UPDATE local_credentials SET password_hash=$1 WHERE user_id=$2 AND password_hash=$3",
    )
    .bind(replacement)
    .bind(session.user_id)
    .bind(encoded)
    .execute(&mut *tx)
    .await
    .auth_unavailable()?;
    if changed.rows_affected() != 1 {
        return Err(credentials());
    }
    sqlx::query("DELETE FROM sessions WHERE user_id=$1")
        .bind(session.user_id)
        .execute(&mut *tx)
        .await
        .auth_unavailable()?;
    tx.commit().await.auth_unavailable()?;
    Ok(clear_cookies(&auth))
}

/// CLI-only credential provisioning. Hash before taking the database lock.
pub async fn provision(
    db: &Database,
    username: &str,
    password: String,
    reset: bool,
) -> Result<(), String> {
    let username = normalize_username(username)?;
    let encoded = tokio::task::spawn_blocking(move || hash_password(&password))
        .await
        .map_err(|_| "Password hashing failed")??;
    let mut tx = db
        .pool
        .begin()
        .await
        .map_err(|_| "Could not access database")?;
    if reset {
        let user: i64 = sqlx::query_scalar(
            "UPDATE local_credentials SET password_hash=$1 WHERE username=$2 RETURNING user_id",
        )
        .bind(encoded)
        .bind(&username)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| "Local account not found or database unavailable")?;
        sqlx::query("DELETE FROM sessions WHERE user_id=$1")
            .bind(user)
            .execute(&mut *tx)
            .await
            .map_err(|_| "Could not revoke sessions")?;
    } else {
        let user: i64 = sqlx::query_scalar(
            "INSERT INTO users (oidc_issuer,oidc_subject) VALUES ($1,$2) RETURNING id",
        )
        .bind(LOCAL_ISSUER)
        .bind(&username)
        .fetch_one(&mut *tx)
        .await
        .map_err(|_| "Account already exists or database unavailable")?;
        sqlx::query(
            "INSERT INTO local_credentials (user_id,username,password_hash) VALUES ($1,$2,$3)",
        )
        .bind(user)
        .bind(username)
        .bind(encoded)
        .execute(&mut *tx)
        .await
        .map_err(|_| "Could not create local credentials")?;
    }
    tx.commit()
        .await
        .map_err(|_| "Could not commit credentials".into())
}

#[cfg(test)]
mod tests {
    use super::*;
    #[tokio::test]
    async fn hashing_workers_are_bounded() {
        let local = Local::new().await.unwrap();
        let first = local.workers.clone().try_acquire_owned().unwrap();
        let second = local.workers.clone().try_acquire_owned().unwrap();
        assert!(
            local
                .check("password".into(), local.dummy.clone())
                .await
                .is_err()
        );
        assert!(
            local
                .hash("a sufficiently long password".into())
                .await
                .is_err()
        );
        drop(first);
        drop(second);
        assert!(
            !local
                .check("incorrect".into(), local.dummy.clone())
                .await
                .ok()
                .unwrap()
        );
        assert_eq!(local.workers.available_permits(), 2);
    }

    #[test]
    fn username_and_password_rules() {
        assert_eq!(normalize_username("Alice.Smith").unwrap(), "alice.smith");
        for name in ["ab", " alice", "álîce", "-alice", "alice@home"] {
            assert!(normalize_username(name).is_err());
        }
        assert!(validate_password("short").is_err());
        assert!(validate_password(&"x".repeat(1025)).is_err());
        assert!(validate_password("a long passphrase is good").is_ok());
    }
    #[test]
    fn salted_argon2id_and_verification() {
        let password = "a sufficiently long password";
        let first = hash_password(password).unwrap();
        let second = hash_password(password).unwrap();
        assert!(first.starts_with("$argon2id$v=19$m=19456,t=2,p=1$"));
        assert_ne!(first, second);
        assert!(verifies(password, &first));
        assert!(!verifies("incorrect", &first));
        assert!(!verifies(password, "invalid hash"));
    }
}
