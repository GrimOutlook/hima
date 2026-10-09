use axum::{
    Json, Router,
    http::Request,
    middleware::{self, Next},
    response::Response,
    routing::get,
};
use serde::Serialize;
use std::time::Instant;

use crate::error::ApiError;

#[derive(Serialize)]
struct Health {
    status: &'static str,
}

pub fn router() -> Router {
    Router::new()
        .route("/health", get(|| async { Json(Health { status: "ok" }) }))
        .fallback(|| async { ApiError::not_found() })
        .method_not_allowed_fallback(|| async { ApiError::method_not_allowed() })
        .layer(middleware::from_fn(log_request))
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
