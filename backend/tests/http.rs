use axum::{
    body::Body,
    http::{Request, StatusCode},
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use tower::ServiceExt;

#[tokio::test]
async fn health_and_api_error_contract() {
    for (method, path, status, expected) in [
        ("GET", "/health", StatusCode::OK, json!({"status":"ok"})),
        (
            "GET",
            "/api/planner",
            StatusCode::UNAUTHORIZED,
            json!({"error":{"code":"unauthenticated","message":"Sign in to access this endpoint."}}),
        ),
        (
            "PUT",
            "/api/planner",
            StatusCode::UNAUTHORIZED,
            json!({"error":{"code":"unauthenticated","message":"Sign in to access this endpoint."}}),
        ),
        (
            "GET",
            "/api/me",
            StatusCode::UNAUTHORIZED,
            json!({"error":{"code":"unauthenticated","message":"Sign in to access this endpoint."}}),
        ),
        (
            "GET",
            "/auth/login",
            StatusCode::SERVICE_UNAVAILABLE,
            json!({"error":{"code":"auth_unavailable","message":"Authentication is not configured."}}),
        ),
        (
            "GET",
            "/missing?token=secret",
            StatusCode::NOT_FOUND,
            json!({"error":{"code":"not_found","message":"The requested endpoint does not exist."}}),
        ),
        (
            "POST",
            "/health",
            StatusCode::METHOD_NOT_ALLOWED,
            json!({"error":{"code":"method_not_allowed","message":"The HTTP method is not supported for this endpoint."}}),
        ),
    ] {
        let response = hima_api::server::router()
            .oneshot(
                Request::builder()
                    .method(method)
                    .uri(path)
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), status);
        assert_eq!(response.headers()["content-type"], "application/json");
        let bytes = response.into_body().collect().await.unwrap().to_bytes();
        assert_eq!(serde_json::from_slice::<Value>(&bytes).unwrap(), expected);
    }
}
