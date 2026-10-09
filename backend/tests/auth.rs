//! A controlled OIDC provider with real RSA signatures and a real PostgreSQL DB.
use axum::{
    Json, Router,
    body::Body,
    extract::{Form, State},
    http::{HeaderMap, Request, StatusCode},
    routing::{get, post},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD as B64};
use hima_api::{auth::Auth, db::Database, server};
use http_body_util::BodyExt;
use rsa::{
    RsaPrivateKey,
    pkcs1v15::SigningKey,
    signature::{SignatureEncoding, Signer},
    traits::PublicKeyParts,
};
use serde_json::{Value, json};
use sha2::{Digest, Sha256};
use sqlx::PgPool;
use std::{
    collections::HashMap,
    sync::{Arc, Mutex},
};
use tower::ServiceExt;

struct Provider {
    issuer: String,
    key: RsaPrivateKey,
    codes: Mutex<HashMap<String, (String, String, String)>>,
}

// Exercise the actual TCP HTTP server and shared PostgreSQL storage, using
// independent sessions and simultaneous requests rather than a mock repository.
async fn planner_http_contract(app: &Router, pool: &PgPool) {
    let db = Database::from_pool(pool.clone());
    let mut users = Vec::new();
    let tokens = ["a".repeat(43), "b".repeat(43), "c".repeat(43)];
    for (i, token) in tokens.iter().enumerate() {
        let user = db
            .ensure_user("https://planner-test", &i.to_string())
            .await
            .unwrap();
        users.push(user);
        sqlx::query("INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES ($1,$2,'planner-csrf',clock_timestamp() + interval '1 hour')")
            .bind(hex::encode(Sha256::digest(token.as_bytes()))).bind(user).execute(pool).await.unwrap();
    }
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let url = format!("http://{}/api/planner", listener.local_addr().unwrap());
    let service = app.clone();
    let task = tokio::spawn(async move { axum::serve(listener, service).await.unwrap() });
    let client = openidconnect::reqwest::Client::new();
    let send = |method: &str, token: &str, body: String, origin: &str, csrf: &str| {
        client
            .request(method.parse().unwrap(), &url)
            .header("cookie", format!("__Host-hima-session={token}"))
            .header("origin", origin)
            .header("x-csrf-token", csrf)
            .header("content-type", "application/json")
            .body(body)
            .send()
    };
    let doc = json!({"version":1,"pools":[],"events":[],"next_id":1});
    let body = |revision, document: &Value| {
        json!({"expected_revision":revision,"document":document}).to_string()
    };
    for method in ["GET", "PUT"] {
        let r = send(
            method,
            "",
            body(0, &doc),
            "https://app.example",
            "planner-csrf",
        )
        .await
        .unwrap();
        assert_eq!(r.status().as_u16(), 401);
        assert_eq!(r.headers()["cache-control"], "no-store");
    }
    let empty = send("GET", &tokens[0], String::new(), "", "")
        .await
        .unwrap();
    assert_eq!(empty.status().as_u16(), 200);
    assert_eq!(
        serde_json::from_str::<Value>(&empty.text().await.unwrap()).unwrap(),
        json!({"document":null,"revision":0,"updated_at":null})
    );
    let missing = send(
        "PUT",
        &tokens[0],
        body(1, &doc),
        "https://app.example",
        "planner-csrf",
    )
    .await
    .unwrap();
    assert_eq!(missing.status().as_u16(), 409);
    for revision in [0, 1] {
        let a_doc = json!({"version":1,"pools":[],"events":[],"next_id":2});
        let b_doc = json!({"version":1,"pools":[],"events":[],"next_id":3});
        let (a, b) = tokio::join!(
            send(
                "PUT",
                &tokens[0],
                body(revision, &a_doc),
                "https://app.example",
                "planner-csrf"
            ),
            send(
                "PUT",
                &tokens[0],
                body(revision, &b_doc),
                "https://app.example",
                "planner-csrf"
            )
        );
        let a = a.unwrap();
        let b = b.unwrap();
        assert!(matches!(
            (a.status().as_u16(), b.status().as_u16()),
            (200, 409) | (409, 200)
        ));
        let winner = if a.status().as_u16() == 200 { a } else { b };
        let saved: Value = serde_json::from_str(&winner.text().await.unwrap()).unwrap();
        assert_eq!(saved["revision"], revision + 1);
        assert_eq!(
            db.load(users[0]).await.unwrap().unwrap().document,
            saved["document"]
        );
    }
    let before = db.load(users[0]).await.unwrap().unwrap();
    for (content_type, raw, expected_status) in [
        ("text/plain", body(2, &doc), 415),
        ("application/json", " ".repeat(2 * 1024 * 1024 + 1), 413),
    ] {
        let r = client
            .put(&url)
            .header("cookie", format!("__Host-hima-session={}", tokens[0]))
            .header("origin", "https://app.example")
            .header("x-csrf-token", "planner-csrf")
            .header("content-type", content_type)
            .body(raw)
            .send()
            .await
            .unwrap();
        assert_eq!(r.status().as_u16(), expected_status);
        let error: Value = serde_json::from_str(&r.text().await.unwrap()).unwrap();
        assert_eq!(error["error"]["code"], "invalid_request");
        assert_eq!(db.load(users[0]).await.unwrap().unwrap(), before);
    }
    let loaded = client
        .get(format!("{url}?user_id={}", users[1]))
        .header("cookie", format!("__Host-hima-session={}", tokens[0]))
        .send()
        .await
        .unwrap();
    assert_eq!(loaded.status().as_u16(), 200);
    assert_eq!(
        serde_json::from_str::<Value>(&loaded.text().await.unwrap()).unwrap(),
        serde_json::to_value(&before).unwrap()
    );
    for (raw, status) in [
        (body(1, &doc), 409),
        (body(0, &doc), 409),
        (body(2, &json!({"version":2})), 422),
        (
            body(
                2,
                &json!({"version":1,"pools":[],"events":[{"id":1,"name":"Bad","days":[{"date":"2026-01-01","allocations":[{"pool_id":42,"hours":1}]}]}],"next_id":2}),
            ),
            422,
        ),
        (body(-1, &doc), 422),
        (json!({"document":doc}).to_string(), 422),
        (
            json!({"document":doc,"expected_revision":2,"user_id":users[1]}).to_string(),
            422,
        ),
        (
            json!({"document":doc,"expected_revision":2.5}).to_string(),
            422,
        ),
        ("{".into(), 400),
    ] {
        let r = send(
            "PUT",
            &tokens[0],
            raw,
            "https://app.example",
            "planner-csrf",
        )
        .await
        .unwrap();
        assert_eq!(r.status().as_u16(), status);
        let error: Value = serde_json::from_str(&r.text().await.unwrap()).unwrap();
        assert!(error["error"]["code"].is_string());
        assert_eq!(db.load(users[0]).await.unwrap().unwrap(), before);
    }
    for (origin, csrf) in [
        ("", "planner-csrf"),
        ("https://evil.example", "planner-csrf"),
        ("https://app.example", ""),
        ("https://app.example", "wrong"),
    ] {
        assert_eq!(
            send("PUT", &tokens[0], body(2, &doc), origin, csrf)
                .await
                .unwrap()
                .status()
                .as_u16(),
            403
        );
        assert_eq!(db.load(users[0]).await.unwrap().unwrap(), before);
    }
    assert_eq!(
        send(
            "PUT",
            &tokens[1],
            body(2, &doc),
            "https://app.example",
            "planner-csrf"
        )
        .await
        .unwrap()
        .status()
        .as_u16(),
        409
    );
    assert!(db.load(users[1]).await.unwrap().is_none());
    assert_eq!(
        send(
            "PUT",
            &tokens[1],
            body(0, &doc),
            "https://app.example",
            "planner-csrf"
        )
        .await
        .unwrap()
        .status()
        .as_u16(),
        200
    );
    let own = send("GET", &tokens[1], String::new(), "", "")
        .await
        .unwrap();
    let own: Value = serde_json::from_str(&own.text().await.unwrap()).unwrap();
    assert_eq!(own["document"], doc);
    assert_eq!(own["revision"], 1);
    assert_eq!(db.load(users[0]).await.unwrap().unwrap(), before);
    sqlx::query(
        "UPDATE sessions SET expires_at=clock_timestamp() - interval '1 second' WHERE user_id=$1",
    )
    .bind(users[2])
    .execute(pool)
    .await
    .unwrap();
    for method in ["GET", "PUT"] {
        assert_eq!(
            send(
                method,
                &tokens[2],
                body(0, &doc),
                "https://app.example",
                "planner-csrf"
            )
            .await
            .unwrap()
            .status()
            .as_u16(),
            401
        );
    }
    task.abort();
    for user in users {
        sqlx::query("DELETE FROM users WHERE id=$1")
            .bind(user)
            .execute(pool)
            .await
            .unwrap();
    }
}
async fn token(
    State(p): State<Arc<Provider>>,
    headers: HeaderMap,
    Form(form): Form<HashMap<String, String>>,
) -> (StatusCode, Json<Value>) {
    let code = form.get("code").unwrap();
    let (nonce, challenge, mode) = p.codes.lock().unwrap().remove(code).unwrap();
    assert_eq!(form["grant_type"], "authorization_code");
    assert_eq!(form["redirect_uri"], "https://app.example/auth/callback");
    if let Some(authorization) = headers.get("authorization") {
        assert_eq!(authorization, "Basic aGltYS10ZXN0OnRlc3Qtc2VjcmV0");
    } else {
        assert_eq!(form["client_id"], "hima-test");
    }
    if B64.encode(Sha256::digest(form["code_verifier"].as_bytes())) != challenge {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_grant"})),
        );
    }
    if mode == "token_error" {
        return (
            StatusCode::BAD_REQUEST,
            Json(json!({"error":"invalid_grant"})),
        );
    }
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_secs();
    let mut claims = json!({"iss":p.issuer,"sub":"subject-1","aud":"hima-test","exp":now+300,"iat":now,"nonce":nonce,"email":"same@example.test","at_hash":B64.encode(&Sha256::digest(b"provider-access-token")[..16]),"c_hash":B64.encode(&Sha256::digest(code.as_bytes())[..16])});
    match mode.as_str() {
        "issuer" => claims["iss"] = json!("https://evil.example"),
        "audience" => claims["aud"] = json!("other-client"),
        "azp" => claims["azp"] = json!("other-client"),
        "nonce" => claims["nonce"] = json!("wrong"),
        "expired" => claims["exp"] = json!(now - 1),
        "future" => claims["iat"] = json!(now + 3600),
        "hash" => claims["at_hash"] = json!("wrong"),
        "code_hash" => claims["c_hash"] = json!("wrong"),
        "missing_nonce" => {
            claims.as_object_mut().unwrap().remove("nonce");
        }
        "subject" => claims["sub"] = json!("subject-2"),
        _ => {}
    }
    let header = B64.encode(br#"{"alg":"RS256","kid":"test-key","typ":"JWT"}"#);
    let payload = B64.encode(serde_json::to_vec(&claims).unwrap());
    let input = format!("{header}.{payload}");
    let mut signature = SigningKey::<Sha256>::new(p.key.clone())
        .sign(input.as_bytes())
        .to_vec();
    if mode == "signature" {
        signature[0] ^= 1;
    }
    let id_token = format!("{input}.{}", B64.encode(signature));
    let mut body =
        json!({"access_token":"provider-access-token","token_type":"Bearer","id_token":id_token});
    if mode == "missing_id" {
        body.as_object_mut().unwrap().remove("id_token");
    }
    (StatusCode::OK, Json(body))
}
async fn request(
    app: &Router,
    method: &str,
    uri: &str,
    cookie: &str,
    extra: &[(&str, &str)],
) -> axum::response::Response {
    let mut builder = Request::builder()
        .method(method)
        .uri(uri)
        .header("cookie", cookie);
    for (name, value) in extra {
        builder = builder.header(*name, *value);
    }
    app.clone()
        .oneshot(builder.body(Body::empty()).unwrap())
        .await
        .unwrap()
}
fn cookie(response: &axum::response::Response, name: &str) -> String {
    response
        .headers()
        .get_all("set-cookie")
        .iter()
        .map(|v| v.to_str().unwrap())
        .find(|v| v.starts_with(name))
        .unwrap()
        .split(';')
        .next()
        .unwrap()
        .to_owned()
}
async fn start(app: &Router, provider: &Provider, mode: &str) -> (String, String) {
    let response = request(app, "GET", "/auth/login", "", &[]).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(response.headers()["cache-control"], "no-store");
    let raw_cookie = response.headers()["set-cookie"].to_str().unwrap();
    for attribute in [
        "Secure",
        "HttpOnly",
        "SameSite=Lax",
        "Path=/",
        "Max-Age=600",
    ] {
        assert!(raw_cookie.contains(attribute));
    }
    let browser = cookie(&response, "__Host-hima-login=");
    let url =
        openidconnect::url::Url::parse(response.headers()["location"].to_str().unwrap()).unwrap();
    let query: HashMap<String, String> = url.query_pairs().into_owned().collect();
    assert_eq!(query["response_type"], "code");
    assert_eq!(query["code_challenge_method"], "S256");
    assert!(query["scope"].split_whitespace().any(|s| s == "openid"));
    let code = query["state"].clone();
    provider.codes.lock().unwrap().insert(
        code.clone(),
        (
            query["nonce"].clone(),
            if mode == "pkce" {
                "wrong-challenge".into()
            } else {
                query["code_challenge"].clone()
            },
            mode.into(),
        ),
    );
    (format!("/auth/callback?state={code}&code={code}"), browser)
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn oidc_and_persistent_browser_sessions(pool: PgPool) {
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let issuer = format!("http://{}", listener.local_addr().unwrap());
    let provider = Arc::new(Provider {
        issuer: issuer.clone(),
        key: RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap(),
        codes: Mutex::new(HashMap::new()),
    });
    let discovery = json!({"issuer":issuer,"authorization_endpoint":format!("{issuer}/authorize"),"token_endpoint":format!("{issuer}/token"),"jwks_uri":format!("{issuer}/jwks"),"response_types_supported":["code"],"subject_types_supported":["public"],"id_token_signing_alg_values_supported":["RS256"],"code_challenge_methods_supported":["S256"]});
    let jwks = json!({"keys":[{"kty":"RSA","kid":"test-key","use":"sig","alg":"RS256","n":B64.encode(provider.key.n().to_bytes_be()),"e":B64.encode(provider.key.e().to_bytes_be())}]});
    let routes = Router::new()
        .route(
            "/.well-known/openid-configuration",
            get(move || {
                let data = discovery.clone();
                async move { Json(data) }
            }),
        )
        .route(
            "/jwks",
            get(move || {
                let data = jwks.clone();
                async move { Json(data) }
            }),
        )
        .route("/token", post(token))
        .with_state(provider.clone());
    let task = tokio::spawn(async move {
        axum::serve(listener, routes).await.unwrap();
    });
    let make = || {
        Auth::new(
            Database::from_pool(pool.clone()),
            &issuer,
            "hima-test".into(),
            None,
            "https://app.example",
        )
    };
    let app = server::with_auth(make().await.unwrap());
    planner_http_contract(&app, &pool).await;
    for origin in [
        "http://app.example",
        "https://app.example/path",
        "https://user:password@app.example",
        "https://app.example?query=1",
    ] {
        assert!(
            Auth::new(
                Database::from_pool(pool.clone()),
                &issuer,
                "hima-test".into(),
                None,
                origin
            )
            .await
            .is_err()
        );
    }
    let local = server::with_auth(
        Auth::new(
            Database::from_pool(pool.clone()),
            &issuer,
            "hima-test".into(),
            None,
            "http://localhost:3000",
        )
        .await
        .unwrap(),
    );
    let local_login = request(&local, "GET", "/auth/login", "", &[]).await;
    let local_cookie = local_login.headers()["set-cookie"].to_str().unwrap();
    assert!(local_cookie.starts_with("hima-login="));
    assert!(!local_cookie.contains("Secure"));
    let local_url =
        openidconnect::url::Url::parse(local_login.headers()["location"].to_str().unwrap())
            .unwrap();
    assert!(
        local_url
            .query_pairs()
            .any(|(k, v)| k == "redirect_uri" && v == "http://localhost:3000/auth/callback")
    );
    assert_eq!(
        request(&app, "GET", "/api/me", "", &[]).await.status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&app, "GET", "/auth/callback?code=bad&state=bad", "", &[])
            .await
            .status(),
        StatusCode::BAD_REQUEST
    );
    for mode in [
        "issuer",
        "audience",
        "azp",
        "nonce",
        "expired",
        "future",
        "hash",
        "code_hash",
        "missing_nonce",
        "pkce",
        "signature",
        "missing_id",
        "token_error",
    ] {
        let (callback, browser) = start(&app, &provider, mode).await;
        let response = request(&app, "GET", &callback, &browser, &[]).await;
        assert_eq!(response.status(), StatusCode::BAD_REQUEST, "{mode}");
        assert!(!response.headers().contains_key("set-cookie"));
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    let (callback, browser) = start(&app, &provider, "valid").await;
    // A stolen state alone cannot consume another browser's login.
    assert_eq!(
        request(
            &app,
            "GET",
            &callback,
            "__Host-hima-login=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
            &[]
        )
        .await
        .status(),
        StatusCode::BAD_REQUEST
    );
    let response = request(&app, "GET", &callback, &browser, &[]).await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let session = cookie(&response, "__Host-hima-session=");
    let raw = session.split_once('=').unwrap().1;
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions WHERE token_hash=$1")
            .bind(raw)
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    assert!(
        response
            .headers()
            .get_all("set-cookie")
            .iter()
            .any(|v| v.to_str().unwrap().contains("Max-Age=604800"))
    );
    assert_eq!(
        request(&app, "GET", &callback, &browser, &[])
            .await
            .status(),
        StatusCode::BAD_REQUEST
    );
    // Recreate the backend state and reconnect: no in-memory session dependency.
    let reopened = Database::from_pool(
        sqlx::postgres::PgPoolOptions::new()
            .connect_with((*pool.connect_options()).clone())
            .await
            .unwrap(),
    );
    let restored = server::with_auth(
        Auth::new(
            reopened,
            &issuer,
            "hima-test".into(),
            None,
            "https://app.example",
        )
        .await
        .unwrap(),
    );
    let me = request(&restored, "GET", "/api/me", &session, &[]).await;
    assert_eq!(me.status(), StatusCode::OK);
    let bytes = me.into_body().collect().await.unwrap().to_bytes();
    let me: Value = serde_json::from_slice(&bytes).unwrap();
    assert!(!String::from_utf8_lossy(&bytes).contains("provider-access-token"));
    let csrf = me["csrf_token"].as_str().unwrap();
    assert_eq!(
        request(&restored, "POST", "/api/future-mutation", &session, &[])
            .await
            .status(),
        StatusCode::FORBIDDEN
    );
    assert_eq!(
        request(
            &restored,
            "GET",
            "/api/me",
            &format!("{session}; {session}"),
            &[]
        )
        .await
        .status(),
        StatusCode::UNAUTHORIZED
    );
    assert_eq!(
        request(&restored, "GET", "/auth/logout", &session, &[])
            .await
            .status(),
        StatusCode::METHOD_NOT_ALLOWED
    );
    for extra in [
        vec![],
        vec![("origin", "https://evil.example"), ("x-csrf-token", csrf)],
        vec![("origin", "https://app.example"), ("x-csrf-token", "bad")],
    ] {
        assert_eq!(
            request(&restored, "POST", "/auth/logout", &session, &extra)
                .await
                .status(),
            StatusCode::FORBIDDEN
        );
    }
    // Same identity yields the same account; rotation revokes the previous session.
    let (callback, browser) = start(&app, &provider, "valid").await;
    let response = request(
        &app,
        "GET",
        &callback,
        &format!("{browser}; {session}"),
        &[],
    )
    .await;
    let rotated = cookie(&response, "__Host-hima-session=");
    assert_ne!(session, rotated);
    assert_eq!(
        request(&restored, "GET", "/api/me", &session, &[])
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let response = request(&restored, "GET", "/api/me", &rotated, &[]).await;
    let rotated_me: Value =
        serde_json::from_slice(&response.into_body().collect().await.unwrap().to_bytes()).unwrap();
    assert_eq!(me["user_id"], rotated_me["user_id"]);
    let logout = request(
        &restored,
        "POST",
        "/auth/logout",
        &rotated,
        &[
            ("origin", "https://app.example"),
            ("x-csrf-token", rotated_me["csrf_token"].as_str().unwrap()),
        ],
    )
    .await;
    assert_eq!(logout.status(), StatusCode::SEE_OTHER);
    assert!(
        logout.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .contains("Max-Age=0")
    );
    assert_eq!(
        request(&restored, "GET", "/api/me", &rotated, &[])
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    let (callback, browser) = start(&app, &provider, "subject").await;
    assert_eq!(
        request(&app, "GET", &callback, &browser, &[])
            .await
            .status(),
        StatusCode::SEE_OTHER
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM users")
            .fetch_one(&pool)
            .await
            .unwrap(),
        2
    ); // same email, distinct subject
    let confidential = server::with_auth(
        Auth::new(
            Database::from_pool(pool.clone()),
            &issuer,
            "hima-test".into(),
            Some("test-secret".into()),
            "https://app.example",
        )
        .await
        .unwrap(),
    );
    let (callback, browser) = start(&confidential, &provider, "valid").await;
    let response = request(
        &confidential,
        "GET",
        &callback,
        &browser,
        &[("x-forwarded-proto", "http"), ("host", "evil.example")],
    )
    .await;
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    let expiring_session = cookie(&response, "__Host-hima-session=");
    assert!(
        response.headers()["set-cookie"]
            .to_str()
            .unwrap()
            .contains("Secure")
    );
    sqlx::query("UPDATE sessions SET expires_at=clock_timestamp()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(&app, "GET", "/api/me", &expiring_session, &[])
            .await
            .status(),
        StatusCode::UNAUTHORIZED
    );
    sqlx::query("UPDATE login_transactions SET expires_at=clock_timestamp()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    let (callback, browser) = start(&app, &provider, "valid").await;
    sqlx::query("UPDATE login_transactions SET expires_at=clock_timestamp()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        request(&app, "GET", &callback, &browser, &[])
            .await
            .status(),
        StatusCode::BAD_REQUEST
    );
    let (callback, browser) = start(&app, &provider, "valid").await;
    assert_eq!(
        request(
            &app,
            "GET",
            &format!("{callback}&error=access_denied"),
            &browser,
            &[]
        )
        .await
        .status(),
        StatusCode::BAD_REQUEST
    );
    assert_eq!(
        request(&app, "GET", &callback, &browser, &[])
            .await
            .status(),
        StatusCode::BAD_REQUEST
    );
    let (callback, browser) = start(&app, &provider, "valid").await;
    assert_eq!(
        request(
            &app,
            "GET",
            &format!("{callback}&iss=https%3A%2F%2Fevil.example"),
            &browser,
            &[]
        )
        .await
        .status(),
        StatusCode::BAD_REQUEST
    );
    task.abort();
}
