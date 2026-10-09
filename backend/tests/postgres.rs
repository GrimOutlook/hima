use hima_api::db::{Database, SaveError};
use serde_json::json;
use sqlx::PgPool;

// SQLx creates and migrates an isolated database for each test and drops it.
// Explicitly ignored by default so offline backend checks remain usable.
#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn persistence_validation_and_constraints(pool: PgPool) {
    let db = Database::from_pool(pool.clone());
    db.migrate().await.unwrap(); // already applied: migration reruns are harmless
    let user = db.ensure_user("https://issuer", "subject").await.unwrap();
    assert_eq!(
        user,
        db.ensure_user("https://issuer", "subject").await.unwrap()
    );
    let other = db
        .ensure_user("https://other-issuer", "subject")
        .await
        .unwrap();
    assert_ne!(user, other);
    assert!(db.load(user).await.unwrap().is_none());
    let v = json!({"version":1,"pools":[],"events":[],"next_id":1});
    assert!(matches!(
        db.save(user, &v, 1).await,
        Err(SaveError::Conflict)
    ));
    let first = db.save(user, &v, 0).await.unwrap();
    assert_eq!(first.revision, 1);
    for bad in [
        json!({"version":2,"pools":[],"events":[],"next_id":1}),
        json!({"version":1,"pools":[],"events":[{"id":1,"name":"Bad","days":[{"date":"2026-01-01","allocations":[{"pool_id":42,"hours":1}]}]}],"next_id":2}),
    ] {
        assert!(matches!(
            db.save(user, &bad, 1).await,
            Err(SaveError::Invalid(_))
        ));
        assert_eq!(db.load(user).await.unwrap().unwrap(), first);
    }
    assert!(db.load(other).await.unwrap().is_none());
    let (a, b) = tokio::join!(db.save(user, &v, 1), db.save(user, &v, 1));
    assert!(matches!(
        (&a, &b),
        (Ok(_), Err(SaveError::Conflict)) | (Err(SaveError::Conflict), Ok(_))
    ));
    assert!(matches!(
        db.save(user, &v, 0).await,
        Err(SaveError::Conflict)
    ));
    let saved = db.load(user).await.unwrap().unwrap();
    assert!(saved.updated_at >= first.updated_at);
    let options = pool.connect_options();
    db.close().await; // simulate process shutdown: discard all connections
    let reopened_pool = sqlx::postgres::PgPoolOptions::new()
        .connect_with((*options).clone())
        .await
        .unwrap();
    let reopened = Database::from_pool(reopened_pool.clone());
    assert_eq!(reopened.load(user).await.unwrap().unwrap(), saved);
    assert!(reopened.load(other).await.unwrap().is_none());
    for (query, code) in [
        (
            "INSERT INTO users (oidc_issuer, oidc_subject) VALUES ('https://issuer', 'subject')",
            "23505",
        ),
        (
            "INSERT INTO users (oidc_issuer, oidc_subject) VALUES ('', 'subject')",
            "23514",
        ),
        (
            "INSERT INTO planners (user_id, document) VALUES (99999999, '{}')",
            "23503",
        ),
        (
            "INSERT INTO planners (user_id, document) SELECT id, '{}' FROM users WHERE oidc_issuer = 'https://issuer'",
            "23505",
        ),
        ("UPDATE planners SET revision = 0", "23514"),
        ("UPDATE planners SET document = '[]'", "23514"),
    ] {
        let error = sqlx::query(query)
            .execute(&reopened_pool)
            .await
            .unwrap_err();
        assert_eq!(
            error.as_database_error().unwrap().code().as_deref(),
            Some(code)
        );
    }
    sqlx::query("DELETE FROM users WHERE id = $1")
        .bind(user)
        .execute(&reopened_pool)
        .await
        .unwrap();
    assert!(reopened.load(user).await.unwrap().is_none());
    reopened.close().await;
}
