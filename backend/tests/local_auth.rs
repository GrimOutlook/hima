use axum::{
    Router,
    body::Body,
    http::{Request, StatusCode, header},
};
use hima_api::{
    auth::{Auth, local::provision},
    db::Database,
    server,
};
use http_body_util::BodyExt;
use serde_json::{Value, json};
use sqlx::PgPool;
use tower::ServiceExt;

const ORIGIN: &str = "https://app.example";
const PASSWORD: &str = "a long local test passphrase";

async fn request(
    app: &Router,
    method: &str,
    path: &str,
    body: Value,
    cookie: Option<&str>,
    csrf: Option<&str>,
    origin: Option<&str>,
) -> axum::response::Response {
    let mut request = Request::builder()
        .method(method)
        .uri(path)
        .header(header::CONTENT_TYPE, "application/json");
    if let Some(cookie) = cookie {
        request = request.header(header::COOKIE, cookie);
    }
    if let Some(csrf) = csrf {
        request = request.header("x-csrf-token", csrf);
    }
    if let Some(origin) = origin {
        request = request.header(header::ORIGIN, origin);
    }
    app.clone()
        .oneshot(request.body(Body::from(body.to_string())).unwrap())
        .await
        .unwrap()
}
async fn json_body(response: axum::response::Response) -> Value {
    serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap()
}
async fn login(app: &Router, username: &str, password: &str) -> axum::response::Response {
    request(
        app,
        "POST",
        "/auth/local/login",
        json!({"username":username,"password":password}),
        None,
        None,
        Some(ORIGIN),
    )
    .await
}
fn session_cookie(response: &axum::response::Response) -> String {
    response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .filter_map(|value| value.to_str().ok())
        .find(|value| value.starts_with("__Host-hima-session=") && !value.contains("Max-Age=0"))
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned()
}
async fn me(app: &Router, cookie: &str) -> axum::response::Response {
    request(app, "GET", "/api/me", Value::Null, Some(cookie), None, None).await
}
async fn app(pool: PgPool) -> Router {
    server::with_auth(
        Auth::new_local(Database::from_pool(pool), ORIGIN)
            .await
            .unwrap(),
    )
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires disposable PostgreSQL DATABASE_URL"]
async fn local_login_sessions_reset_and_isolation(pool: PgPool) {
    let db = Database::from_pool(pool.clone());
    provision(&db, "Alice", PASSWORD.into(), false)
        .await
        .unwrap();
    provision(&db, "bob", PASSWORD.into(), false).await.unwrap();
    assert!(
        provision(&db, "ALICE", PASSWORD.into(), false)
            .await
            .is_err()
    );
    assert!(
        provision(&db, " bad name", PASSWORD.into(), false)
            .await
            .is_err()
    );
    let app = app(pool.clone()).await;
    assert_eq!(
        json_body(request(&app, "GET", "/auth/options", Value::Null, None, None, None).await).await,
        json!({"local":true,"oidc":false})
    );
    for (name, password) in [("alice", "wrong"), ("unknown", PASSWORD), ("!", PASSWORD)] {
        let response = login(&app, name, password).await;
        assert_eq!(response.status(), StatusCode::UNAUTHORIZED);
        assert_eq!(
            json_body(response).await["error"]["code"],
            "invalid_credentials"
        );
    }
    for origin in [None, Some("https://attacker.example")] {
        assert_eq!(
            request(
                &app,
                "POST",
                "/auth/local/login",
                json!({"username":"alice","password":PASSWORD}),
                None,
                None,
                origin
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
    }
    let response = login(&app, "ALICE", PASSWORD).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let headers = response
        .headers()
        .get_all(header::SET_COOKIE)
        .iter()
        .map(|v| v.to_str().unwrap())
        .collect::<Vec<_>>()
        .join(";");
    for flag in ["Secure", "HttpOnly", "SameSite=Lax", "Path=/"] {
        assert!(headers.contains(flag));
    }
    let alice = session_cookie(&response);
    let first = json_body(me(&app, &alice).await).await;
    let bob = session_cookie(&login(&app, "bob", PASSWORD).await);
    let bob_me = json_body(me(&app, &bob).await).await;
    assert_ne!(first["user_id"], bob_me["user_id"]);
    let account = json_body(
        request(
            &app,
            "GET",
            "/auth/local/account",
            Value::Null,
            Some(&alice),
            None,
            None,
        )
        .await,
    )
    .await;
    assert_eq!(account["local"], true);
    // Planner ownership uses the same existing authorization path.
    let document = json!({"version":1,"next_id":1,"pools":[],"events":[]});
    assert_eq!(
        request(
            &app,
            "PUT",
            "/api/planner",
            json!({"document":document,"expected_revision":0}),
            Some(&alice),
            Some(first["csrf_token"].as_str().unwrap()),
            Some(ORIGIN)
        )
        .await
        .status(),
        StatusCode::OK
    );
    let alice_planner = json_body(
        request(
            &app,
            "GET",
            "/api/planner",
            Value::Null,
            Some(&alice),
            None,
            None,
        )
        .await,
    )
    .await;
    assert_eq!(alice_planner["document"], document);
    let bob_planner = json_body(
        request(
            &app,
            "GET",
            "/api/planner",
            Value::Null,
            Some(&bob),
            None,
            None,
        )
        .await,
    )
    .await;
    assert_eq!(bob_planner["document"], Value::Null);
    assert_eq!(
        request(
            &app,
            "PUT",
            "/api/planner",
            json!({"document":document,"expected_revision":0}),
            Some(&bob),
            Some(first["csrf_token"].as_str().unwrap()),
            Some(ORIGIN)
        )
        .await
        .status(),
        StatusCode::FORBIDDEN
    );
    let db_user = first["user_id"].as_i64().unwrap();
    assert_ne!(
        db.ensure_user("https://issuer.example", "alice")
            .await
            .unwrap(),
        db_user
    );
    // Re-login rotates the presented application session.
    let response = request(
        &app,
        "POST",
        "/auth/local/login",
        json!({"username":"alice","password":PASSWORD}),
        Some(&alice),
        None,
        Some(ORIGIN),
    )
    .await;
    let second = session_cookie(&response);
    assert_eq!(me(&app, &alice).await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(me(&app, &second).await.status(), StatusCode::OK);
    provision(&db, "alice", "replacement password phrase".into(), true)
        .await
        .unwrap();
    assert_eq!(me(&app, &second).await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(me(&app, &bob).await.status(), StatusCode::OK);
    assert_eq!(
        login(&app, "alice", PASSWORD).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        login(&app, "alice", "replacement password phrase")
            .await
            .status(),
        StatusCode::SEE_OTHER
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires disposable PostgreSQL DATABASE_URL"]
async fn password_change_csrf_and_revocation(pool: PgPool) {
    let db = Database::from_pool(pool.clone());
    provision(&db, "alice", PASSWORD.into(), false)
        .await
        .unwrap();
    let app = app(pool).await;
    let first = session_cookie(&login(&app, "alice", PASSWORD).await);
    let second = session_cookie(&login(&app, "alice", PASSWORD).await);
    let session = json_body(me(&app, &first).await).await;
    let csrf = session["csrf_token"].as_str().unwrap();
    let change = json!({"current_password":PASSWORD,"new_password":"a new long password phrase"});
    for (token, origin) in [
        (None, Some(ORIGIN)),
        (Some("wrong"), Some(ORIGIN)),
        (Some(csrf), None),
        (Some(csrf), Some("https://evil.example")),
    ] {
        assert_eq!(
            request(
                &app,
                "POST",
                "/auth/local/password",
                change.clone(),
                Some(&first),
                token,
                origin
            )
            .await
            .status(),
            StatusCode::FORBIDDEN
        );
    }
    let wrong = json!({"current_password":"wrong","new_password":"a new long password phrase"});
    assert_eq!(
        request(
            &app,
            "POST",
            "/auth/local/password",
            wrong,
            Some(&first),
            Some(csrf),
            Some(ORIGIN)
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    let short = json!({"current_password":PASSWORD,"new_password":"short"});
    assert_eq!(
        request(
            &app,
            "POST",
            "/auth/local/password",
            short,
            Some(&first),
            Some(csrf),
            Some(ORIGIN)
        )
        .await
        .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(
            &app,
            "POST",
            "/auth/local/password",
            change,
            Some(&first),
            Some(csrf),
            Some(ORIGIN)
        )
        .await
        .status(),
        StatusCode::SEE_OTHER
    );
    assert_eq!(me(&app, &first).await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(me(&app, &second).await.status(), StatusCode::UNAUTHORIZED);
    assert_eq!(
        login(&app, "alice", PASSWORD).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        login(&app, "alice", "a new long password phrase")
            .await
            .status(),
        StatusCode::SEE_OTHER
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires disposable PostgreSQL DATABASE_URL"]
async fn reset_racing_with_verified_login_cannot_create_a_stale_session(pool: PgPool) {
    let db = Database::from_pool(pool.clone());
    provision(&db, "alice", PASSWORD.into(), false)
        .await
        .unwrap();
    let app = app(pool.clone()).await;
    let replacement = hima_api::auth::local::hash_password("replacement long passphrase").unwrap();
    let mut reset = pool.begin().await.unwrap();
    sqlx::query("UPDATE local_credentials SET password_hash=$1 WHERE username='alice'")
        .bind(replacement)
        .execute(&mut *reset)
        .await
        .unwrap();
    // The nonlocking read sees the old committed hash, but session creation must
    // wait for this reset's row lock. Wait for that DB condition, not a sleep.
    let pending = tokio::spawn(async move { login(&app, "alice", PASSWORD).await });
    tokio::time::timeout(std::time::Duration::from_secs(10), async {
        loop {
            let waiting: bool = sqlx::query_scalar("SELECT EXISTS(SELECT 1 FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE 'SELECT password_hash FROM local_credentials%FOR UPDATE%')")
                .fetch_one(&pool).await.unwrap();
            if waiting { break; }
            tokio::time::sleep(std::time::Duration::from_millis(10)).await;
        }
    }).await.expect("login should wait for the reset's credential lock");
    reset.commit().await.unwrap();
    assert_eq!(pending.await.unwrap().status(), StatusCode::UNAUTHORIZED);
    let sessions: i64 = sqlx::query_scalar("SELECT count(*) FROM sessions")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(sessions, 0);
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires disposable PostgreSQL DATABASE_URL"]
async fn shared_throttle_disabled_mode_and_redaction(pool: PgPool) {
    let first = app(pool.clone()).await;
    let second = app(pool.clone()).await;
    sqlx::query("INSERT INTO local_login_admission (id,window_start,attempts) VALUES (TRUE,clock_timestamp(),29)").execute(&pool).await.unwrap();
    let (one, two) = tokio::join!(
        login(&first, "nobody", PASSWORD),
        login(&second, "nobody", PASSWORD)
    );
    let statuses = [one.status(), two.status()];
    assert_eq!(
        statuses
            .iter()
            .filter(|s| **s == StatusCode::UNAUTHORIZED)
            .count(),
        1
    );
    assert_eq!(
        statuses
            .iter()
            .filter(|s| **s == StatusCode::TOO_MANY_REQUESTS)
            .count(),
        1
    );
    sqlx::query(
        "UPDATE local_login_admission SET window_start=clock_timestamp()-interval '2 minutes'",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(
        login(&second, "nobody", PASSWORD).await.status(),
        StatusCode::UNAUTHORIZED
    );
    let malformed = request(
        &first,
        "POST",
        "/auth/local/login",
        json!({"username":true,"password":"DO-NOT-ECHO"}),
        None,
        None,
        Some(ORIGIN),
    )
    .await;
    let bytes = malformed.into_body().collect().await.unwrap().to_bytes();
    assert!(!String::from_utf8_lossy(&bytes).contains("DO-NOT-ECHO"));
    let disabled = server::router();
    assert_eq!(
        json_body(
            request(
                &disabled,
                "GET",
                "/auth/options",
                Value::Null,
                None,
                None,
                None
            )
            .await
        )
        .await,
        json!({"local":false,"oidc":false})
    );
    assert_eq!(
        login(&disabled, "alice", PASSWORD).await.status(),
        StatusCode::SERVICE_UNAVAILABLE
    );
}
