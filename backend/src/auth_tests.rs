use super::*;

#[sqlx::test(migrations = false)]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn csrf_upgrade_preserves_sessions_but_rejects_legacy_and_cross_session_tokens(
    pool: sqlx::PgPool,
) {
    use http_body_util::BodyExt;
    use tower::ServiceExt;
    sqlx::migrate::Migrator::with_migrations(crate::db::MIGRATOR.iter().take(3).cloned().collect())
        .run(&pool)
        .await
        .unwrap();
    let auth = login_test_auth(pool.clone());
    let user = auth
        .db
        .ensure_user("https://issuer.example", "upgrade")
        .await
        .unwrap();
    let tokens = ["a".repeat(43), "b".repeat(43)];
    for token in &tokens {
        sqlx::query("INSERT INTO sessions(token_hash,user_id,csrf_token,expires_at) VALUES($1,$2,'legacy-csrf',clock_timestamp()+interval '1 hour')")
            .bind(hash(token)).bind(user).execute(&pool).await.unwrap();
    }
    let before: Vec<(
        String,
        chrono::DateTime<chrono::Utc>,
        chrono::DateTime<chrono::Utc>,
    )> = sqlx::query_as(
        "SELECT token_hash,expires_at,last_seen_at FROM sessions ORDER BY token_hash",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    auth.db.migrate().await.unwrap();
    auth.db.migrate().await.unwrap();
    let after: Vec<(
        String,
        chrono::DateTime<chrono::Utc>,
        chrono::DateTime<chrono::Utc>,
    )> = sqlx::query_as(
        "SELECT token_hash,expires_at,last_seen_at FROM sessions ORDER BY token_hash",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(before, after);
    assert!(!sqlx::query_scalar::<_, bool>("SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='sessions' AND column_name='csrf_token')").fetch_one(&pool).await.unwrap());
    let app = router(auth.clone()).layer(axum::middleware::from_fn_with_state(auth, protect));
    let cookie = format!("__Host-hima-session={}", tokens[0]);
    let me = app
        .clone()
        .oneshot(
            Request::builder()
                .uri("/api/me")
                .header(header::COOKIE, &cookie)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(me.status(), StatusCode::OK);
    let me: serde_json::Value =
        serde_json::from_slice(&me.into_body().collect().await.unwrap().to_bytes()).unwrap();
    let csrf = me["csrf_token"].as_str().unwrap();
    assert_eq!(csrf, session_csrf(&tokens[0]));
    for invalid_csrf in [
        "legacy-csrf".to_owned(),
        hash(&tokens[0]),
        session_csrf(&hash(&tokens[0])),
        tokens[0].clone(),
        session_csrf(&tokens[1]),
    ] {
        let response = app
            .clone()
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/auth/logout")
                    .header(header::COOKIE, &cookie)
                    .header(header::ORIGIN, "https://app.example")
                    .header("x-csrf-token", invalid_csrf)
                    .body(axum::body::Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::FORBIDDEN);
    }
    // The touch path must return the same derived token as a fresh read.
    sqlx::query("UPDATE sessions SET last_seen_at=clock_timestamp()-interval '6 minutes'")
        .execute(&pool)
        .await
        .unwrap();
    let response = app
        .oneshot(
            Request::builder()
                .method("POST")
                .uri("/auth/logout")
                .header(header::COOKIE, &cookie)
                .header(header::ORIGIN, "https://app.example")
                .header("x-csrf-token", csrf)
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
}

fn login_test_auth(pool: sqlx::PgPool) -> Arc<Auth> {
    let metadata: CoreProviderMetadata = serde_json::from_value(serde_json::json!({
        "issuer":"https://issuer.example", "authorization_endpoint":"https://issuer.example/auth",
        "token_endpoint":"https://issuer.example/token", "jwks_uri":"https://issuer.example/keys",
        "response_types_supported":["code"], "subject_types_supported":["public"],
        "id_token_signing_alg_values_supported":["RS256"]
    }))
    .unwrap();
    let client =
        CoreClient::from_provider_metadata(metadata.clone(), ClientId::new("test".into()), None);
    Arc::new(Auth {
        signing: Mutex::new(SigningKeys {
            metadata,
            client: client.clone(),
            last_attempt: Instant::now(),
        }),
        client,
        http: openidconnect::reqwest::Client::new(),
        db: Database::from_pool(pool),
        origin: "https://app.example".into(),
        secure: true,
        client_id: "test".into(),
        issuer: "https://issuer.example".into(),
        cleanup_task: None,
    })
}

async fn seed_logins(pool: &sqlx::PgPool, count: i64) {
    sqlx::query(
        "INSERT INTO login_transactions (state_hash,browser_hash,nonce,verifier,expires_at)
        SELECT 'seed-' || n, 'browser', 'nonce', 'verifier', clock_timestamp()+interval '10 minutes'
        FROM generate_series(1,$1) n",
    )
    .bind(count)
    .execute(pool)
    .await
    .unwrap();
}

async fn login_request(auth: Arc<Auth>) -> Response {
    use tower::ServiceExt;
    router(auth)
        .oneshot(
            Request::builder()
                .uri("/auth/login")
                .body(axum::body::Body::empty())
                .unwrap(),
        )
        .await
        .unwrap()
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn login_capacity_is_atomic_across_independent_instances(pool: sqlx::PgPool) {
    seed_logins(&pool, LOGIN_CAPACITY - 2).await;
    // Independent Auth instances and pools model separate backend processes.
    let second_pool = sqlx::postgres::PgPoolOptions::new()
        .max_connections(8)
        .connect_with(pool.connect_options().as_ref().clone())
        .await
        .unwrap();
    let a = login_test_auth(pool.clone());
    let b = login_test_auth(second_pool.clone());
    let responses = futures_util::future::join_all(
        (0..32).map(|i| login_request(if i % 2 == 0 { a.clone() } else { b.clone() })),
    )
    .await;
    assert_eq!(
        responses
            .iter()
            .filter(|r| r.status() == StatusCode::SEE_OTHER)
            .count(),
        2
    );
    for response in responses {
        if response.status() != StatusCode::SEE_OTHER {
            assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
            assert!(!response.headers().contains_key(header::SET_COOKIE));
            assert!(!response.headers().contains_key(header::LOCATION));
        }
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM login_transactions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        LOGIN_CAPACITY
    );
    // Consuming a transaction releases capacity; no process-local counter drifts.
    sqlx::query("DELETE FROM login_transactions WHERE state_hash='seed-1'")
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(login_request(b).await.status(), StatusCode::SEE_OTHER);
    second_pool.close().await;
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn login_ignores_expired_rows_without_request_cleanup(pool: sqlx::PgPool) {
    seed_logins(&pool, LOGIN_CAPACITY).await;
    sqlx::query("UPDATE login_transactions SET expires_at=clock_timestamp()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    let auth = login_test_auth(pool.clone());
    let user = auth
        .db
        .ensure_user("https://issuer.example", "expired")
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO sessions(token_hash,user_id,expires_at)
        VALUES ('expired',$1,clock_timestamp()-interval '1 second')",
    )
    .bind(user)
    .execute(&pool)
    .await
    .unwrap();
    assert_eq!(login_request(auth).await.status(), StatusCode::SEE_OTHER);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM login_transactions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        LOGIN_CAPACITY + 1
    );
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn cancelled_login_does_not_leak_admission_lock_or_capacity(pool: sqlx::PgPool) {
    let auth = login_test_auth(pool.clone());
    let mut blocker = pool.begin().await.unwrap();
    sqlx::query("SELECT pg_advisory_xact_lock($1)")
        .bind(LOGIN_ADMISSION_LOCK)
        .execute(&mut *blocker)
        .await
        .unwrap();
    let request = tokio::spawn(login_request(auth.clone()));
    tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            let waiting: bool = sqlx::query_scalar(
                "SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory'
                 AND database=(SELECT oid FROM pg_database WHERE datname=current_database())
                 AND NOT granted)",
            )
            .fetch_one(&pool)
            .await
            .unwrap();
            if waiting {
                break;
            }
            tokio::time::sleep(Duration::from_millis(10)).await;
        }
    })
    .await
    .unwrap();
    request.abort();
    assert!(request.await.unwrap_err().is_cancelled());
    blocker.rollback().await.unwrap();
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM login_transactions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
    assert_eq!(
        tokio::time::timeout(Duration::from_secs(5), login_request(auth))
            .await
            .unwrap()
            .status(),
        StatusCode::SEE_OTHER
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn cleanup_runs_without_requests_retries_and_stops_with_auth(pool: sqlx::PgPool) {
    let mut auth = login_test_auth(pool.clone());
    let user = auth
        .db
        .ensure_user("https://issuer.example", "cleanup")
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO sessions(token_hash,user_id,expires_at,last_seen_at)
        VALUES ('expired',$1,clock_timestamp()-interval '1 second',clock_timestamp()),
        ('idle',$1,clock_timestamp()+interval '1 day',clock_timestamp()-interval '2 days'),
        ('live',$1,clock_timestamp()+interval '1 day',clock_timestamp())",
    )
    .bind(user)
    .execute(&pool)
    .await
    .unwrap();
    seed_logins(&pool, 1).await;
    // Force initial cleanup failure, then verify the same worker recovers.
    sqlx::query("ALTER TABLE login_transactions RENAME TO hidden_logins")
        .execute(&pool)
        .await
        .unwrap();
    let task = spawn_cleanup(pool.clone(), Duration::from_millis(20));
    let abort = task.abort_handle();
    Arc::get_mut(&mut auth).unwrap().cleanup_task = Some(task);
    tokio::time::sleep(Duration::from_millis(80)).await;
    assert!(!abort.is_finished());
    sqlx::query("ALTER TABLE hidden_logins RENAME TO login_transactions")
        .execute(&pool)
        .await
        .unwrap();
    for _ in 0..2 {
        sqlx::query(
            "UPDATE login_transactions SET expires_at=clock_timestamp()-interval '1 second'",
        )
        .execute(&pool)
        .await
        .unwrap();
        tokio::time::timeout(Duration::from_secs(5), async {
            loop {
                let count: i64 = sqlx::query_scalar("SELECT count(*) FROM login_transactions")
                    .fetch_one(&pool)
                    .await
                    .unwrap();
                if count == 0 {
                    break;
                }
                tokio::time::sleep(Duration::from_millis(10)).await;
            }
        })
        .await
        .unwrap();
        seed_logins(&pool, 1).await;
    }
    assert_eq!(
        sqlx::query_scalar::<_, String>("SELECT token_hash FROM sessions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        "live"
    );
    drop(auth);
    tokio::time::timeout(Duration::from_secs(5), async {
        while !abort.is_finished() {
            tokio::task::yield_now().await;
        }
    })
    .await
    .unwrap();
    sqlx::query("UPDATE login_transactions SET expires_at=clock_timestamp()-interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();
    tokio::time::sleep(Duration::from_millis(80)).await;
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM login_transactions")
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
}

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn unsafe_handlers_reuse_the_middleware_session(pool: sqlx::PgPool) {
    use axum::{body::Body, middleware};
    use serde_json::json;
    use tower::ServiceExt;

    let metadata: CoreProviderMetadata = serde_json::from_value(json!({
        "issuer":"https://issuer.example", "authorization_endpoint":"https://issuer.example/auth",
        "token_endpoint":"https://issuer.example/token", "jwks_uri":"https://issuer.example/keys",
        "response_types_supported":["code"], "subject_types_supported":["public"],
        "id_token_signing_alg_values_supported":["RS256"]
    }))
    .unwrap();
    let client =
        CoreClient::from_provider_metadata(metadata.clone(), ClientId::new("test".into()), None);
    let auth = Arc::new(Auth {
        cleanup_task: None,
        signing: Mutex::new(SigningKeys {
            metadata,
            client: client.clone(),
            last_attempt: Instant::now(),
        }),
        client,
        http: openidconnect::reqwest::Client::new(),
        db: Database::from_pool(pool.clone()),
        origin: "https://app.example".into(),
        secure: true,
        client_id: "test".into(),
        issuer: "https://issuer.example".into(),
    });
    let user = auth
        .db
        .ensure_user("https://issuer.example", "extension-user")
        .await
        .unwrap();
    let token = "e".repeat(43);
    sqlx::query("INSERT INTO sessions (token_hash,user_id,expires_at) VALUES ($1,$2,clock_timestamp()+interval '1 hour')")
        .bind(hash(&token)).bind(user).execute(&pool).await.unwrap();
    // Strip the cookie AFTER protect: any handler lookup would now return 401.
    let app = router(auth.clone())
        .merge(crate::planner_api::router(auth.clone()))
        .layer(middleware::from_fn(
            |mut request: Request, next: Next| async move {
                request.headers_mut().remove(header::COOKIE);
                next.run(request).await
            },
        ))
        .layer(middleware::from_fn_with_state(auth, protect));
    for (method, path, body, status) in [
        (
            "PUT",
            "/api/planner",
            r#"{"expected_revision":0,"document":{"version":1,"pools":[],"events":[],"next_id":1}}"#,
            StatusCode::OK,
        ),
        ("POST", "/auth/logout-all", "", StatusCode::SEE_OTHER),
    ] {
        let request = Request::builder()
            .method(method)
            .uri(path)
            .header(header::COOKIE, format!("__Host-hima-session={token}"))
            .header(header::ORIGIN, "https://app.example")
            .header("x-csrf-token", session_csrf(&token))
            .header(header::CONTENT_TYPE, "application/json")
            .body(Body::from(body))
            .unwrap();
        assert_eq!(app.clone().oneshot(request).await.unwrap().status(), status);
    }
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions WHERE user_id=$1")
            .bind(user)
            .fetch_one(&pool)
            .await
            .unwrap(),
        0
    );
}

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
        let key = RsaPrivateKey::new(&mut rsa::rand_core::OsRng, 2048).unwrap();
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
        let signature = SigningKey::<rsa::sha2::Sha256>::new(key).sign(input.as_bytes());
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

#[test]
fn optional_token_hashes_reject_mismatches_and_computation_errors() {
    assert!(verify_optional_hash(Some(&"expected"), || Ok::<_, ()>("expected")).is_ok());
    assert!(verify_optional_hash(Some(&"expected"), || Ok::<_, ()>("wrong")).is_err());
    assert!(verify_optional_hash(Some(&"expected"), || Err::<&str, _>(())).is_err());
    assert!(
        verify_optional_hash::<&str, ()>(None, || panic!("absent hashes must not be computed"))
            .is_ok()
    );
}

#[test]
fn transport_allows_http_only_on_loopback_and_rejects_url_credentials() {
    for url in [
        "https://example.com",
        "http://localhost:8080",
        "http://127.0.0.1",
        "http://[::1]",
    ] {
        assert!(
            secure_transport(&openidconnect::url::Url::parse(url).unwrap()),
            "{url}"
        );
    }
    for url in [
        "http://example.com",
        "https://user@example.com",
        "https://user:password@example.com",
        "https://example.com/#fragment",
        "ftp://localhost",
    ] {
        assert!(
            !secure_transport(&openidconnect::url::Url::parse(url).unwrap()),
            "{url}"
        );
    }
}
