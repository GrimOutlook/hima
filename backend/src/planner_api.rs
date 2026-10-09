use crate::{auth::Auth, db::SaveError, error::ApiError};
use axum::{
    Json, Router,
    extract::{State, rejection::JsonRejection},
    http::{HeaderMap, StatusCode},
    routing::get,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::sync::Arc;

#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct SaveRequest {
    expected_revision: i64,
    document: Value,
}

#[derive(Serialize)]
struct PlannerResponse {
    document: Option<Value>,
    revision: i64,
    updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

pub(crate) fn router(auth: Arc<Auth>) -> Router {
    Router::new()
        .route("/api/planner", get(load).put(save))
        .with_state(auth)
}

fn unavailable() -> ApiError {
    ApiError::auth(
        StatusCode::SERVICE_UNAVAILABLE,
        "planner_unavailable",
        "Planner storage is temporarily unavailable.",
    )
}

async fn load(
    State(auth): State<Arc<Auth>>,
    headers: HeaderMap,
) -> Result<Json<PlannerResponse>, ApiError> {
    let session = auth.session(&headers).await?;
    let stored = auth
        .db
        .load(session.user_id)
        .await
        .map_err(|_| unavailable())?;
    Ok(Json(match stored {
        Some(p) => PlannerResponse {
            document: Some(p.document),
            revision: p.revision,
            updated_at: Some(p.updated_at),
        },
        None => PlannerResponse {
            document: None,
            revision: 0,
            updated_at: None,
        },
    }))
}

async fn save(
    State(auth): State<Arc<Auth>>,
    headers: HeaderMap,
    body: Result<Json<SaveRequest>, JsonRejection>,
) -> Result<Json<PlannerResponse>, ApiError> {
    let session = auth.session(&headers).await?;
    let Json(body) = body.map_err(|e| {
        ApiError::auth(
            e.status(),
            "invalid_request",
            "Expected a JSON object with document and nonnegative integer expected_revision.",
        )
    })?;
    let p = auth
        .db
        .save(session.user_id, &body.document, body.expected_revision)
        .await
        .map_err(|e| match e {
            SaveError::Invalid(_) => ApiError::auth(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_document",
                "The document or expected revision is invalid.",
            ),
            SaveError::Conflict => ApiError::auth(
                StatusCode::CONFLICT,
                "revision_conflict",
                "The planner has changed; load it before saving again.",
            ),
            SaveError::Database(_) => unavailable(),
        })?;
    Ok(Json(PlannerResponse {
        document: Some(p.document),
        revision: p.revision,
        updated_at: Some(p.updated_at),
    }))
}
