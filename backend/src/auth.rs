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
    core::{CoreClient, CoreProviderMetadata},
};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{sync::Arc, time::Duration};
use subtle::ConstantTimeEq;

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
    http: openidconnect::reqwest::Client,
    pub(crate) db: Database,
    origin: String,
    secure: bool,
    client_id: String,
    issuer: String,
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
        let client = CoreClient::from_provider_metadata(
            metadata,
            ClientId::new(id.clone()),
            secret.map(ClientSecret::new),
        )
        .set_redirect_uri(
            RedirectUrl::new(format!("{origin}/auth/callback"))
                .map_err(|_| "invalid callback URL")?,
        );
        Ok(Arc::new(Self {
            client,
            http,
            db,
            origin,
            secure,
            client_id: id,
            issuer,
        }))
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
        let mut found = None;
        for header in headers.get_all(header::COOKIE) {
            for part in header.to_str().ok()?.split(';') {
                let (name, value) = part.trim().split_once('=')?;
                if name == self.name(login) {
                    if found.is_some() {
                        return None;
                    }
                    found = Some(value);
                }
            }
        }
        found.filter(|v| v.len() >= 32 && v.len() <= 128)
    }
    pub(crate) async fn session(&self, headers: &HeaderMap) -> Result<Session, ApiError> {
        let token = self.read_cookie(headers, false).ok_or_else(unauthorized)?;
        sqlx::query_as::<_, Session>("SELECT user_id, csrf_token FROM sessions WHERE token_hash = $1 AND expires_at > clock_timestamp()") .bind(hash(token)).fetch_optional(&self.db.pool).await.map_err(|_| unavailable())?.ok_or_else(unauthorized)
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
    sqlx::query("DELETE FROM sessions WHERE expires_at <= clock_timestamp()")
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
    let verifier = auth
        .client
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
    let claims = id_token
        .claims(&verifier, &Nonce::new(nonce))
        .map_err(|_| invalid())?;
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

/// Applied to every unsafe API request, including subsequently added planner routes.
pub(crate) async fn protect(
    State(auth): State<Arc<Auth>>,
    request: Request,
    next: Next,
) -> Result<Response, ApiError> {
    if request.method().is_safe()
        || !(request.uri().path().starts_with("/api/") || request.uri().path() == "/auth/logout")
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
