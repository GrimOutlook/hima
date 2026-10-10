//! Backend-only OIDC credentials and persistent, opaque browser sessions.
use crate::{db::Database, error::ApiError};
use axum::{
    Json, Router,
    extract::{Query, Request, State, rejection::QueryRejection},
    http::{HeaderMap, StatusCode, header},
    middleware::Next,
    response::{IntoResponse, Redirect, Response},
    routing::{get, post},
};
use openidconnect::{
    AccessTokenHash, AuthorizationCode, AuthorizationCodeHash, ClientId, ClientSecret, CsrfToken,
    EndpointMaybeSet, EndpointNotSet, EndpointSet, IssuerUrl, Nonce, OAuth2TokenResponse,
    PkceCodeChallenge, PkceCodeVerifier, RedirectUrl, TokenResponse,
    core::{CoreClient, CoreJsonWebKeySet, CoreProviderMetadata},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{
    sync::Arc,
    time::{Duration, Instant},
};
use subtle::ConstantTimeEq;
use tokio::sync::Mutex;

type Client = CoreClient<
    EndpointSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointNotSet,
    EndpointMaybeSet,
    EndpointMaybeSet,
>;
pub struct Auth {
    client: Client,
    signing: Mutex<SigningKeys>,
    http: openidconnect::reqwest::Client,
    pub(crate) db: Database,
    origin: String,
    secure: bool,
    client_id: String,
    issuer: String,
}
const KEY_REFRESH_INTERVAL: Duration = Duration::from_secs(3600);
const KEY_REFRESH_MIN_INTERVAL: Duration = Duration::from_secs(60);

struct SigningKeys {
    metadata: CoreProviderMetadata,
    client: Client,
    last_attempt: Instant,
}

impl SigningKeys {
    async fn verification_client(
        &mut self,
        token: &openidconnect::core::CoreIdToken,
        nonce: &Nonce,
        http: &openidconnect::reqwest::Client,
    ) -> Client {
        if matches!(
            token.claims(&self.client.id_token_verifier(), nonce),
            Err(
                openidconnect::ClaimsVerificationError::SignatureVerification(
                    openidconnect::SignatureVerificationError::NoMatchingKey
                        | openidconnect::SignatureVerificationError::CryptoError(_)
                )
            )
        ) {
            self.refresh(http).await;
        }
        self.client.clone()
    }

    async fn refresh(&mut self, http: &openidconnect::reqwest::Client) {
        if self.last_attempt.elapsed() < KEY_REFRESH_MIN_INTERVAL {
            return;
        }
        // Serialize fetches and rate-limit failures as well as successes.
        self.last_attempt = Instant::now();
        match CoreJsonWebKeySet::fetch_async(self.metadata.jwks_uri(), http).await {
            Ok(keys) => {
                self.metadata = self.metadata.clone().set_jwks(keys);
                // This client is used only for verification, never token exchange.
                self.client = CoreClient::from_provider_metadata(
                    self.metadata.clone(),
                    self.client.client_id().clone(),
                    None,
                );
            }
            Err(_) => tracing::warn!("OIDC signing-key refresh failed; retaining previous keys"),
        }
    }
}
fn invalid() -> ApiError {
    ApiError::auth(
        StatusCode::BAD_REQUEST,
        "invalid_callback",
        "The login response is invalid or expired.",
    )
}
fn unavailable() -> ApiError {
    ApiError::auth(
        StatusCode::SERVICE_UNAVAILABLE,
        "auth_unavailable",
        "Authentication is temporarily unavailable.",
    )
}
fn unauthorized() -> ApiError {
    ApiError::auth(
        StatusCode::UNAUTHORIZED,
        "unauthenticated",
        "Sign in to access this endpoint.",
    )
}
fn forbidden() -> ApiError {
    ApiError::auth(
        StatusCode::FORBIDDEN,
        "csrf_failed",
        "The request failed CSRF verification.",
    )
}
fn hash(value: &str) -> String {
    hex::encode(Sha256::digest(value.as_bytes()))
}
fn random() -> String {
    CsrfToken::new_random_len(32).secret().clone()
}

fn secure_transport(url: &openidconnect::url::Url) -> bool {
    (url.scheme() == "https"
        || (url.scheme() == "http"
            && matches!(url.host_str(), Some("localhost" | "127.0.0.1" | "[::1]"))))
        && url.host_str().is_some()
        && url.username().is_empty()
        && url.password().is_none()
        && url.fragment().is_none()
}

impl Auth {
    pub async fn new(
        db: Database,
        issuer: &str,
        id: String,
        secret: Option<String>,
        origin: &str,
    ) -> Result<Arc<Self>, String> {
        let origin_url = openidconnect::url::Url::parse(origin)
            .map_err(|_| "HIMA_PUBLIC_ORIGIN must be an absolute origin")?;
        let secure = origin_url.scheme() == "https";
        if (!secure
            && !(origin_url.scheme() == "http"
                && matches!(
                    origin_url.host_str(),
                    Some("localhost" | "127.0.0.1" | "[::1]")
                )))
            || origin_url.path() != "/"
            || origin_url.query().is_some()
            || origin_url.fragment().is_some()
            || !origin_url.username().is_empty()
            || origin_url.password().is_some()
        {
            return Err(
                "HIMA_PUBLIC_ORIGIN must be an HTTPS origin (HTTP allowed only on loopback)".into(),
            );
        }
        let issuer_url = IssuerUrl::new(issuer.to_owned())
            .map_err(|_| "HIMA_OIDC_ISSUER must be a valid URL")?;
        if !secure_transport(issuer_url.url()) || issuer_url.url().query().is_some() {
            return Err("HIMA_OIDC_ISSUER must use HTTPS (HTTP allowed only on loopback)".into());
        }
        if id.is_empty() {
            return Err("HIMA_OIDC_CLIENT_ID must not be empty".into());
        }
        let http = openidconnect::reqwest::Client::builder()
            .redirect(openidconnect::reqwest::redirect::Policy::none())
            .timeout(Duration::from_secs(15))
            .build()
            .map_err(|_| "could not initialize OIDC HTTP client")?;
        let metadata = CoreProviderMetadata::discover_async(issuer_url, &http)
            .await
            .map_err(
                |_| "OIDC discovery failed; check HIMA_OIDC_ISSUER and provider availability",
            )?;
        let origin = origin_url.origin().ascii_serialization();
        let token_endpoint = metadata
            .token_endpoint()
            .ok_or("OIDC provider must publish a token endpoint")?;
        if !secure_transport(metadata.authorization_endpoint().url())
            || !secure_transport(token_endpoint.url())
            || !secure_transport(metadata.jwks_uri().url())
        {
            return Err("OIDC endpoints must use HTTPS (HTTP allowed only on loopback)".into());
        }
        let issuer = metadata.issuer().as_str().to_owned();
        let signing_metadata = metadata.clone();
        let client = CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(id.clone()),
            secret.map(ClientSecret::new),
        )
        .set_redirect_uri(
            RedirectUrl::new(format!("{origin}/auth/callback"))
                .map_err(|_| "invalid callback URL")?,
        );
        let auth = Arc::new(Self {
            signing: Mutex::new(SigningKeys {
                metadata: signing_metadata,
                client: client.clone(),
                last_attempt: Instant::now() - KEY_REFRESH_MIN_INTERVAL,
            }),
            client,
            http,
            db,
            origin,
            secure,
            client_id: id,
            issuer,
        });
        let weak = Arc::downgrade(&auth);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(KEY_REFRESH_INTERVAL).await;
                let Some(auth) = weak.upgrade() else { break };
                auth.signing.lock().await.refresh(&auth.http).await;
            }
        });
        Ok(auth)
    }
    fn name(&self, login: bool) -> &'static str {
        match (self.secure, login) {
            (true, true) => "__Host-hima-login",
            (true, false) => "__Host-hima-session",
            (false, true) => "hima-login",
            (false, false) => "hima-session",
        }
    }
    fn cookie(&self, login: bool, value: &str, age: u64) -> String {
        format!(
            "{}={value}; Path=/; HttpOnly; SameSite=Lax; Max-Age={age}{}",
            self.name(login),
            if self.secure { "; Secure" } else { "" }
        )
    }
    fn read_cookie<'a>(&self, headers: &'a HeaderMap, login: bool) -> Option<&'a str> {
        read_cookie(headers, self.name(login))
    }
    pub(crate) async fn session(&self, headers: &HeaderMap) -> Result<Session, ApiError> {
        let token = self.read_cookie(headers, false).ok_or_else(unauthorized)?;
        // Check and touch atomically: expired sessions cannot be revived by activity.
        // Updating activity never extends the absolute expiration set at login.
        sqlx::query_as::<_, Session>("UPDATE sessions SET last_seen_at = clock_timestamp() WHERE token_hash = $1 AND expires_at > clock_timestamp() AND last_seen_at > clock_timestamp() - interval '24 hours' RETURNING user_id, csrf_token") .bind(hash(token)).fetch_optional(&self.db.pool).await.map_err(|_| unavailable())?.ok_or_else(unauthorized)
    }
}

fn read_cookie<'a>(headers: &'a HeaderMap, cookie_name: &str) -> Option<&'a str> {
    let mut found = None;
    for header in headers.get_all(header::COOKIE) {
        let Ok(header) = header.to_str() else {
            continue;
        };
        for part in header.split(';') {
            let Some((name, value)) = part.trim().split_once('=') else {
                continue;
            };
            if name == cookie_name {
                if found.is_some() {
                    return None;
                }
                found = Some(value);
            }
        }
    }
    found.filter(|v| v.len() >= 32 && v.len() <= 128)
}

#[cfg(test)]
mod key_tests {
    use super::*;
    use axum::routing::get;
    use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
    use rsa::{
        RsaPrivateKey,
        pkcs1v15::SigningKey,
        signature::{SignatureEncoding, Signer},
        traits::PublicKeyParts,
    };
    use serde_json::json;
    use std::sync::atomic::{AtomicUsize, Ordering};

    #[tokio::test]
    async fn refresh_replaces_revoked_keys_and_retains_keys_on_failure_without_redirects() {
        let key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
        let jwks = json!({"keys":[{"kty":"RSA","kid":"rotated","use":"sig","alg":"RS256",
            "n":B64.encode(key.n().to_bytes_be()),"e":B64.encode(key.e().to_bytes_be())}]});
        let requests = Arc::new(AtomicUsize::new(0));
        let mode = Arc::new(AtomicUsize::new(0));
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let issuer = format!("http://{}", listener.local_addr().unwrap());
        let app = Router::new().route(
            "/keys",
            get({
                let requests = requests.clone();
                let mode = mode.clone();
                let jwks = jwks.clone();
                move || {
                    let requests = requests.clone();
                    let mode = mode.clone();
                    let jwks = jwks.clone();
                    async move {
                        requests.fetch_add(1, Ordering::SeqCst);
                        match mode.load(Ordering::SeqCst) {
                            0 => Json(jwks).into_response(),
                            1 => StatusCode::SERVICE_UNAVAILABLE.into_response(),
                            3 => Json(json!({"keys":[]})).into_response(),
                            _ => Redirect::temporary("/keys").into_response(),
                        }
                    }
                }
            }),
        );
        let task = tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });
        let metadata: CoreProviderMetadata = serde_json::from_value(json!({
            "issuer":issuer,"authorization_endpoint":format!("{issuer}/authorize"),
            "token_endpoint":format!("{issuer}/token"),"jwks_uri":format!("{issuer}/keys"),
            "response_types_supported":["code"],"subject_types_supported":["public"],
            "id_token_signing_alg_values_supported":["RS256"]
        }))
        .unwrap();
        let metadata = metadata.set_jwks(serde_json::from_value(json!({"keys":[]})).unwrap());
        let mut signing = SigningKeys {
            client: CoreClient::from_provider_metadata(
                metadata.clone(),
                ClientId::new("test".into()),
                None,
            ),
            metadata,
            last_attempt: Instant::now() - KEY_REFRESH_MIN_INTERVAL,
        };
        let http = openidconnect::reqwest::Client::builder()
            .redirect(openidconnect::reqwest::redirect::Policy::none())
            .build()
            .unwrap();
        let now = chrono::Utc::now().timestamp();
        let input = format!("{}.{}", B64.encode(json!({"alg":"RS256","kid":"rotated"}).to_string()),
            B64.encode(json!({"iss":issuer,"sub":"user","aud":"test","iat":now,"exp":now+300,"nonce":"nonce"}).to_string()));
        let signature = SigningKey::<Sha256>::new(key).sign(input.as_bytes());
        let token: openidconnect::core::CoreIdToken =
            format!("{input}.{}", B64.encode(signature.to_bytes()))
                .parse()
                .unwrap();
        let nonce = Nonce::new("nonce".into());
        assert!(
            token
                .claims(&signing.client.id_token_verifier(), &nonce)
                .is_err()
        );
        let refreshed = signing.verification_client(&token, &nonce, &http).await;
        assert!(token.claims(&refreshed.id_token_verifier(), &nonce).is_ok());
        assert!(
            token
                .claims(&signing.client.id_token_verifier(), &nonce)
                .is_ok()
        );
        for failure in [1, 2] {
            mode.store(failure, Ordering::SeqCst);
            signing.last_attempt = Instant::now() - KEY_REFRESH_MIN_INTERVAL;
            signing.refresh(&http).await;
            assert!(
                token
                    .claims(&signing.client.id_token_verifier(), &nonce)
                    .is_ok()
            );
            signing.refresh(&http).await;
            assert_eq!(requests.load(Ordering::SeqCst), failure + 1);
        }
        // A successful empty set removes the previously trusted signing key.
        mode.store(3, Ordering::SeqCst);
        signing.last_attempt = Instant::now() - KEY_REFRESH_MIN_INTERVAL;
        signing.refresh(&http).await;
        assert!(
            token
                .claims(&signing.client.id_token_verifier(), &nonce)
                .is_err()
        );
        task.abort();
    }
}

#[cfg(test)]
mod cookie_tests {
    use super::*;
    use axum::http::HeaderValue;

    #[test]
    fn malformed_cookies_do_not_hide_valid_tokens() {
        let token = "a".repeat(32);
        for name in [
            "__Host-hima-session",
            "__Host-hima-login",
            "hima-session",
            "hima-login",
        ] {
            for value in [
                format!("foo; {name}={token}; bar"),
                format!("{name}={token}; foo"),
            ] {
                for invalid_first in [true, false] {
                    let mut headers = HeaderMap::new();
                    let invalid = HeaderValue::from_bytes(b"other=\xff").unwrap();
                    if invalid_first {
                        headers.append(header::COOKIE, invalid.clone());
                    }
                    headers.append(header::COOKIE, value.parse().unwrap());
                    headers.append(header::COOKIE, invalid);
                    assert_eq!(read_cookie(&headers, name), Some(token.as_str()));
                }
            }
        }
    }

    #[test]
    fn duplicate_tokens_are_rejected_even_with_malformed_cookies() {
        let name = "__Host-hima-session";
        let token = "a".repeat(32);
        for separate_headers in [true, false] {
            let mut headers = HeaderMap::new();
            headers.append(
                header::COOKIE,
                format!("{name}={token}; foo").parse().unwrap(),
            );
            headers.append(
                header::COOKIE,
                HeaderValue::from_bytes(b"other=\xff").unwrap(),
            );
            if separate_headers {
                headers.append(header::COOKIE, format!("{name}={token}").parse().unwrap());
            } else {
                headers.insert(
                    header::COOKIE,
                    format!("{name}={token}; foo; {name}={token}")
                        .parse()
                        .unwrap(),
                );
            }
            assert_eq!(read_cookie(&headers, name), None);
        }
    }

    #[test]
    fn missing_and_invalid_length_tokens_are_rejected() {
        for value in [
            "foo".to_owned(),
            "other=value".to_owned(),
            "hima-session=".to_owned(),
            format!("hima-session={}", "a".repeat(31)),
            format!("hima-session={}", "a".repeat(129)),
        ] {
            let mut headers = HeaderMap::new();
            headers.insert(header::COOKIE, value.parse().unwrap());
            assert_eq!(read_cookie(&headers, "hima-session"), None);
        }
        let mut headers = HeaderMap::new();
        headers.insert(
            header::COOKIE,
            format!("hima-session={}", "a".repeat(128)).parse().unwrap(),
        );
        assert_eq!(read_cookie(&headers, "hima-session").unwrap().len(), 128);
    }
}
#[derive(sqlx::FromRow)]
pub(crate) struct Session {
    pub(crate) user_id: i64,
    csrf_token: String,
}
#[derive(Serialize)]
struct Me {
    user_id: i64,
    csrf_token: String,
}
#[derive(Deserialize)]
struct Callback {
    code: Option<String>,
    state: Option<String>,
    error: Option<String>,
    iss: Option<String>,
}

pub(crate) fn router(auth: Arc<Auth>) -> Router {
    Router::new()
        .route("/auth/login", get(login))
        .route("/auth/callback", get(callback))
        .route("/auth/logout", post(logout))
        .route("/auth/logout-all", post(logout_all))
        .route("/api/me", get(me))
        .with_state(auth)
}
fn response(auth: &Auth, target: &str, cookies: &[(bool, &str, u64)]) -> Response {
    let mut response = Redirect::to(target).into_response();
    for &(login, value, age) in cookies {
        response.headers_mut().append(
            header::SET_COOKIE,
            auth.cookie(login, value, age).parse().unwrap(),
        );
    }
    response
}
async fn login(State(auth): State<Arc<Auth>>) -> Result<Response, ApiError> {
    let (challenge, verifier) = PkceCodeChallenge::new_random_sha256();
    let (url, state, nonce) = auth
        .client
        .authorize_url(
            openidconnect::core::CoreAuthenticationFlow::AuthorizationCode,
            CsrfToken::new_random,
            Nonce::new_random,
        )
        .set_pkce_challenge(challenge)
        .url();
    let browser = random();
    // Bound retention even when callbacks never arrive. No provider tokens are stored.
    sqlx::query("DELETE FROM login_transactions WHERE expires_at <= clock_timestamp()")
        .execute(&auth.db.pool)
        .await
        .map_err(|_| unavailable())?;
    sqlx::query("DELETE FROM sessions WHERE expires_at <= clock_timestamp() OR last_seen_at <= clock_timestamp() - interval '24 hours'")
        .execute(&auth.db.pool)
        .await
        .map_err(|_| unavailable())?;
    sqlx::query("INSERT INTO login_transactions (state_hash, browser_hash, nonce, verifier, expires_at) VALUES ($1,$2,$3,$4,clock_timestamp() + interval '10 minutes')").bind(hash(state.secret())).bind(hash(&browser)).bind(nonce.secret()).bind(verifier.secret()).execute(&auth.db.pool).await.map_err(|_| unavailable())?;
    Ok(response(&auth, url.as_str(), &[(true, &browser, 600)]))
}
async fn callback(
    State(auth): State<Arc<Auth>>,
    headers: HeaderMap,
    query: Result<Query<Callback>, QueryRejection>,
) -> Result<Response, ApiError> {
    let Query(query) = query.map_err(|_| invalid())?;
    let state = query.state.filter(|s| s.len() <= 128).ok_or_else(invalid)?;
    let browser = auth.read_cookie(&headers, true).ok_or_else(invalid)?;
    // Atomic consumption prevents callback replay across processes.
    let row: Option<(String, String)> = sqlx::query_as("DELETE FROM login_transactions WHERE state_hash=$1 AND browser_hash=$2 AND expires_at > clock_timestamp() RETURNING nonce, verifier").bind(hash(&state)).bind(hash(browser)).fetch_optional(&auth.db.pool).await.map_err(|_| unavailable())?;
    let (nonce, verifier) = row.ok_or_else(invalid)?;
    if query.error.is_some() || query.iss.as_ref().is_some_and(|iss| iss != &auth.issuer) {
        return Err(invalid());
    }
    let code = query
        .code
        .filter(|s| !s.is_empty() && s.len() <= 8192)
        .ok_or_else(invalid)?;
    let code = AuthorizationCode::new(code);
    let token = auth
        .client
        .exchange_code(code.clone())
        .map_err(|_| invalid())?
        .set_pkce_verifier(PkceCodeVerifier::new(verifier))
        .request_async(&auth.http)
        .await
        .map_err(|_| invalid())?;
    let id_token = token.id_token().ok_or_else(invalid)?;
    let mut signing = auth.signing.lock().await;
    let nonce = Nonce::new(nonce);
    let verification_client = signing
        .verification_client(id_token, &nonce, &auth.http)
        .await;
    drop(signing);
    let verifier = verification_client
        .id_token_verifier()
        .set_issue_time_verifier_fn(|iat| {
            let now = chrono::Utc::now();
            if iat > now + chrono::Duration::seconds(60)
                || iat < now - chrono::Duration::minutes(11)
            {
                Err("ID token issue time is outside the login window".into())
            } else {
                Ok(())
            }
        });
    let claims = id_token.claims(&verifier, &nonce).map_err(|_| invalid())?;
    // The library validates signature, algorithm, issuer, audience, expiry and nonce.
    if claims
        .authorized_party()
        .is_some_and(|azp| azp.as_str() != auth.client_id)
        || (claims.audiences().len() > 1 && claims.authorized_party().is_none())
    {
        return Err(invalid());
    }
    if let Some(expected) = claims.access_token_hash() {
        let actual = AccessTokenHash::from_token(
            token.access_token(),
            id_token.signing_alg().map_err(|_| invalid())?,
            id_token.signing_key(&verifier).map_err(|_| invalid())?,
        )
        .map_err(|_| invalid())?;
        if expected != &actual {
            return Err(invalid());
        }
    }
    if let Some(expected) = claims.code_hash() {
        let actual = AuthorizationCodeHash::from_code(
            &code,
            id_token.signing_alg().map_err(|_| invalid())?,
            id_token.signing_key(&verifier).map_err(|_| invalid())?,
        )
        .map_err(|_| invalid())?;
        if expected != &actual {
            return Err(invalid());
        }
    }
    let subject = claims.subject().as_str();
    if subject.trim().is_empty() {
        return Err(invalid());
    }
    let user = auth
        .db
        .ensure_user(claims.issuer().as_str(), subject)
        .await
        .map_err(|_| unavailable())?;
    let session = random();
    let mut tx = auth.db.pool.begin().await.map_err(|_| unavailable())?;
    if let Some(old) = auth.read_cookie(&headers, false) {
        sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
            .bind(hash(old))
            .execute(&mut *tx)
            .await
            .map_err(|_| unavailable())?;
    }
    sqlx::query("INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,$3,clock_timestamp() + interval '7 days')").bind(hash(&session)).bind(user).bind(random()).execute(&mut *tx).await.map_err(|_| unavailable())?;
    tx.commit().await.map_err(|_| unavailable())?;
    Ok(response(
        &auth,
        "/",
        &[(true, "", 0), (false, &session, 604800)],
    ))
}
async fn me(State(auth): State<Arc<Auth>>, headers: HeaderMap) -> Result<Json<Me>, ApiError> {
    let session = auth.session(&headers).await?;
    Ok(Json(Me {
        user_id: session.user_id,
        csrf_token: session.csrf_token,
    }))
}
async fn logout(State(auth): State<Arc<Auth>>, headers: HeaderMap) -> Result<Response, ApiError> {
    sqlx::query("DELETE FROM sessions WHERE token_hash=$1")
        .bind(hash(
            auth.read_cookie(&headers, false).ok_or_else(unauthorized)?,
        ))
        .execute(&auth.db.pool)
        .await
        .map_err(|_| unavailable())?;
    Ok(response(&auth, "/", &[(false, "", 0), (true, "", 0)]))
}

async fn logout_all(
    State(auth): State<Arc<Auth>>,
    headers: HeaderMap,
) -> Result<Response, ApiError> {
    let session = auth.session(&headers).await?;
    sqlx::query("DELETE FROM sessions WHERE user_id=$1")
        .bind(session.user_id)
        .execute(&auth.db.pool)
        .await
        .map_err(|_| unavailable())?;
    Ok(response(&auth, "/", &[(false, "", 0), (true, "", 0)]))
}

/// Applied to every unsafe API request, including subsequently added planner routes.
pub(crate) async fn protect(
    State(auth): State<Arc<Auth>>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if request.method().is_safe()
        || !(request.uri().path().starts_with("/api/")
            || matches!(request.uri().path(), "/auth/logout" | "/auth/logout-all"))
    {
        return Ok(next.run(request).await);
    }
    let headers = request.headers();
    let session = auth.session(headers).await?;
    let origin = headers
        .get(header::ORIGIN)
        .and_then(|v| v.to_str().ok())
        .ok_or_else(forbidden)?;
    let csrf = headers
        .get("x-csrf-token")
        .and_then(|v| v.to_str().ok())
        .ok_or_else(forbidden)?;
    if origin != auth.origin || !bool::from(csrf.as_bytes().ct_eq(session.csrf_token.as_bytes())) {
        return Err(forbidden());
    }
    Ok(next.run(request).await)
}
