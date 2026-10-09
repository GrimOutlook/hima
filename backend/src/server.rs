use axum::{
    Json, Router,
    http::Request,
    middleware::{self, Next},
    response::Response,
    routing::{get, post},
};
use serde::Serialize;
use std::time::Instant;

use crate::error::ApiError;

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

pub fn router() -> Router {
    base_router()
        .route("/auth/login", get(disabled))
        .route("/auth/callback", get(disabled))
        .route("/auth/logout", post(unauthenticated))
        .route("/api/me", get(unauthenticated))
        .route("/api/planner", get(unauthenticated).put(unauthenticated))
        .layer(middleware::from_fn(no_store))
        .layer(middleware::from_fn(log_request))
}

async fn disabled() -> ApiError {
    ApiError::auth(
        axum::http::StatusCode::SERVICE_UNAVAILABLE,
        "auth_unavailable",
        "Authentication is not configured.",
    )
}

async fn unauthenticated() -> ApiError {
    ApiError::auth(
        axum::http::StatusCode::UNAUTHORIZED,
        "unauthenticated",
        "Sign in to access this endpoint.",
    )
}

fn base_router() -> Router {
    Router::new()
        .route("/health", get(|| async { Json(Health { status: "ok" }) }))
        .fallback(|| async { ApiError::not_found() })
        .method_not_allowed_fallback(|| async { ApiError::method_not_allowed() })
}

pub fn with_auth(auth: std::sync::Arc<crate::auth::Auth>) -> Router {
    base_router()
        .merge(crate::auth::router(auth.clone()))
        .merge(crate::planner_api::router(auth.clone()))
        .layer(middleware::from_fn_with_state(auth, crate::auth::protect))
        .layer(middleware::from_fn(no_store))
        .layer(middleware::from_fn(log_request))
}

async fn no_store(request: Request<axum::body::Body>, next: Next) -> Response {
    let mut response = next.run(request).await;
    response.headers_mut().insert(
        axum::http::header::CACHE_CONTROL,
        "no-store".parse().unwrap(),
    );
    response.headers_mut().insert(
        axum::http::header::REFERRER_POLICY,
        "no-referrer".parse().unwrap(),
    );
    response
}

async fn log_request(request: Request<axum::body::Body>, next: Next) -> Response {
    let start = Instant::now();
    let method = request.method().clone();
    let response = next.run(request).await;
    // Do not log URLs, headers, or bodies: they may contain credentials.
    tracing::info!(%method, status = response.status().as_u16(), duration_ms = start.elapsed().as_millis() as u64, "request completed");
    response
}

pub async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("could not install SIGTERM handler");
        tokio::select! {
            _ = tokio::signal::ctrl_c() => {},
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c()
        .await
        .expect("could not install Ctrl-C handler");
    tracing::info!("shutting down");
}
