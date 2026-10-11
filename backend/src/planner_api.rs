use crate::{
    auth::{Auth, Session},
    db::{SaveError, SavedPlanner, StoredPlanner},
    error::ApiError,
};
use axum::{
    Extension, Json, Router,
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
    #[serde(default)]
    echo_document: bool,
}

#[derive(Default, Serialize)]
struct PlannerResponse {
    document: Option<Value>,
    revision: i64,
    updated_at: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Serialize)]
struct LoadResponse {
    #[serde(flatten)]
    planner: PlannerResponse,
    // The exact authenticated session used to select the planner, including
    // empty accounts. A user ID alone cannot detect same-account re-login.
    session: Session,
}

pub(crate) fn router(auth: Arc<Auth>) -> Router {
    Router::new()
        .route("/api/planner", get(load).put(save))
        .with_state(auth)
}

impl From<StoredPlanner> for PlannerResponse {
    fn from(stored: StoredPlanner) -> Self {
        Self {
            document: Some(stored.document),
            revision: stored.revision,
            updated_at: Some(stored.updated_at),
        }
    }
}

async fn load(
    State(auth): State<Arc<Auth>>,
    headers: HeaderMap,
) -> Result<Json<LoadResponse>, ApiError> {
    let session = auth.session(&headers).await?;
    let stored = auth
        .db
        .load(session.user_id)
        .await
        .map_err(|_| ApiError::planner_unavailable())?;
    Ok(Json(LoadResponse {
        planner: stored.map(PlannerResponse::from).unwrap_or_default(),
        session,
    }))
}

async fn save(
    State(auth): State<Arc<Auth>>,
    Extension(session): Extension<Session>,
    body: Result<Json<SaveRequest>, JsonRejection>,
) -> Result<Json<SavedPlanner>, ApiError> {
    let Json(body) = body.map_err(|e| {
        ApiError::new(
            e.status(),
            "invalid_request",
            "Expected a JSON object with document and nonnegative integer expected_revision.",
        )
    })?;
    let p = auth
        .db
        .save_with_echo(
            session.user_id,
            &body.document,
            body.expected_revision,
            body.echo_document,
        )
        .await
        .map_err(|e| match e {
            SaveError::Invalid(_) => ApiError::new(
                StatusCode::UNPROCESSABLE_ENTITY,
                "invalid_document",
                "The document or expected revision is invalid.",
            ),
            SaveError::Conflict => ApiError::new(
                StatusCode::CONFLICT,
                "revision_conflict",
                "The planner has changed; load it before saving again.",
            ),
            SaveError::Database(_) => ApiError::planner_unavailable(),
        })?;
    Ok(Json(p))
}
