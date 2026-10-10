use super::*;

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
        let key = RsaPrivateKey::new(&mut rand::thread_rng(), 2048).unwrap();
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
        let signature = SigningKey::<Sha256>::new(key).sign(input.as_bytes());
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
