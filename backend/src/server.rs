use axum::{
    Json, Router,
    http::Request,
    middleware::{self, Next},
    response::{IntoResponse, Response},
    routing::{get, post},
};
use serde::Serialize;
use std::time::{Duration, Instant};

const REQUEST_TIMEOUT: Duration = Duration::from_secs(15);
const HEADER_TIMEOUT: Duration = Duration::from_secs(10);

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
        .route("/auth/logout-all", post(unauthenticated))
        .route("/api/me", get(unauthenticated))
        .route("/api/planner", get(unauthenticated).put(unauthenticated))
        .layer(middleware::from_fn(request_timeout))
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
        .layer(middleware::from_fn(request_timeout))
        .layer(middleware::from_fn(no_store))
        .layer(middleware::from_fn(log_request))
}

async fn request_timeout(request: Request<axum::body::Body>, next: Next) -> Response {
    match tokio::time::timeout(REQUEST_TIMEOUT, next.run(request)).await {
        Ok(response) => response,
        Err(_) => ApiError::auth(
            axum::http::StatusCode::SERVICE_UNAVAILABLE,
            "request_timeout",
            "The request timed out. Please try again.",
        )
        .into_response(),
    }
}

/// Apply header deadlines at the transport layer, before a request reaches Axum.
pub async fn serve(
    listener: tokio::net::TcpListener,
    app: Router,
    shutdown: impl std::future::Future<Output = ()>,
) -> std::io::Result<()> {
    let mut builder = hyper::server::conn::http1::Builder::new();
    builder.timer(hyper_util::rt::TokioTimer::new());
    builder.header_read_timeout(HEADER_TIMEOUT);
    let graceful = hyper_util::server::graceful::GracefulShutdown::new();
    tokio::pin!(shutdown);
    loop {
        tokio::select! {
            _ = &mut shutdown => break,
            accepted = listener.accept() => {
                let (stream, _) = accepted?;
                let connection = builder.serve_connection(
                    hyper_util::rt::TokioIo::new(stream),
                    hyper_util::service::TowerToHyperService::new(app.clone()),
                );
                let connection = graceful.watch(connection);
                tokio::spawn(async move {
                    // Transport failures contain no useful application diagnostics.
                    let _ = connection.await;
                });
            }
        }
    }
    // Slow bodies must not prevent process shutdown indefinitely.
    let _ = tokio::time::timeout(REQUEST_TIMEOUT, graceful.shutdown()).await;
    Ok(())
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

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{body::Body, http::StatusCode};
    use tower::ServiceExt;

    #[tokio::test(start_paused = true)]
    async fn stalled_handler_and_body_return_private_json_503() {
        let app = Router::new()
            .route(
                "/handler",
                get(|| async {
                    std::future::pending::<()>().await;
                    StatusCode::OK
                }),
            )
            .route("/body", post(|_: String| async { StatusCode::OK }))
            .layer(middleware::from_fn(request_timeout))
            .layer(middleware::from_fn(no_store));
        for (method, uri, body) in [
            ("GET", "/handler", Body::empty()),
            (
                "POST",
                "/body",
                Body::from_stream(futures_util::stream::pending::<
                    Result<axum::body::Bytes, std::io::Error>,
                >()),
            ),
        ] {
            let response = app
                .clone()
                .oneshot(
                    Request::builder()
                        .method(method)
                        .uri(uri)
                        .body(body)
                        .unwrap(),
                )
                .await
                .unwrap();
            assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
            assert_eq!(response.headers()["cache-control"], "no-store");
            let body = axum::body::to_bytes(response.into_body(), 1024)
                .await
                .unwrap();
            let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
            assert_eq!(json["error"]["code"], "request_timeout");
        }
    }

    #[tokio::test]
    async fn incomplete_headers_are_disconnected() {
        use tokio::io::{AsyncReadExt, AsyncWriteExt};
        let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
        let address = listener.local_addr().unwrap();
        let (stop, stopped) = tokio::sync::oneshot::channel();
        let server = tokio::spawn(serve(listener, router(), async {
            let _ = stopped.await;
        }));
        let mut client = tokio::net::TcpStream::connect(address).await.unwrap();
        client
            .write_all(b"GET /health HTTP/1.1\r\nHost: localhost\r\n")
            .await
            .unwrap();
        let mut data = Vec::new();
        tokio::time::timeout(
            HEADER_TIMEOUT + Duration::from_secs(2),
            client.read_to_end(&mut data),
        )
        .await
        .expect("header deadline must close connection")
        .unwrap();
        stop.send(()).unwrap();
        server.await.unwrap().unwrap();
    }
}
