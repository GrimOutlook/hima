use hima_api::db::{Database, SaveError};
use serde_json::json;
use sqlx::PgPool;

#[sqlx::test(migrations = "./migrations")]
#[ignore = "requires DATABASE_URL with PostgreSQL role creation privileges"]
async fn runtime_role_can_write_but_cannot_change_schema(pool: PgPool) {
    // Role creation is transactional: rollback also cleans up this global role.
    let mut tx = pool.begin().await.unwrap();
    let database: String = sqlx::query_scalar("SELECT current_database()")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    let role = format!("hima_runtime_{database}");
    assert!(role.chars().all(|c| c.is_ascii_alphanumeric() || c == '_'));
    for statement in [
        format!("CREATE ROLE {role}"),
        "REVOKE CREATE ON SCHEMA public FROM PUBLIC".into(),
        format!("GRANT USAGE ON SCHEMA public TO {role}"),
        format!("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO {role}"),
        format!("SET LOCAL ROLE {role}"),
    ] {
        sqlx::query(&statement).execute(&mut *tx).await.unwrap();
    }
    sqlx::query(
        "INSERT INTO users (oidc_issuer, oidc_subject) VALUES ('least-privilege', 'runtime')",
    )
    .execute(&mut *tx)
    .await
    .unwrap();
    sqlx::query("UPDATE users SET oidc_subject='updated' WHERE oidc_issuer='least-privilege'")
        .execute(&mut *tx)
        .await
        .unwrap();
    let count: i64 = sqlx::query_scalar("SELECT count(*) FROM users WHERE oidc_subject='updated'")
        .fetch_one(&mut *tx)
        .await
        .unwrap();
    assert_eq!(count, 1);
    sqlx::query("DELETE FROM users WHERE oidc_issuer='least-privilege'")
        .execute(&mut *tx)
        .await
        .unwrap();
    for statement in [
        "CREATE TABLE public.forbidden (id integer)",
        "ALTER TABLE users ADD COLUMN forbidden integer",
        "DROP TABLE users CASCADE",
        "TRUNCATE users CASCADE",
    ] {
        sqlx::query("SAVEPOINT denied")
            .execute(&mut *tx)
            .await
            .unwrap();
        let error = sqlx::query(statement).execute(&mut *tx).await.unwrap_err();
        assert_eq!(
            error.as_database_error().unwrap().code().as_deref(),
            Some("42501")
        );
        sqlx::query("ROLLBACK TO SAVEPOINT denied")
            .execute(&mut *tx)
            .await
            .unwrap();
    }
    tx.rollback().await.unwrap();
}

#[sqlx::test(migrations = false)]
#[ignore = "requires DATABASE_URL with PostgreSQL CREATEDB privileges"]
async fn upgrade_preserves_planners_and_rejects_changed_migrations(pool: PgPool) {
    // Start with the deployed planner-only schema, rather than testing only a
    // fresh installation of the latest schema.
    let initial = sqlx::migrate::Migrator {
        migrations: std::borrow::Cow::Borrowed(&hima_api::db::MIGRATOR.migrations[..1]),
        ignore_missing: false,
        locking: true,
        no_tx: false,
    };
    initial.run(&pool).await.unwrap();
    let db = Database::from_pool(pool.clone());
    let user = db.ensure_user("https://upgrade", "existing").await.unwrap();
    let document = json!({"version":1,"pools":[],"events":[],"next_id":9});
    let before = db.save(user, &document, 0).await.unwrap();
    db.migrate().await.unwrap();
    db.migrate().await.unwrap();
    assert_eq!(db.load(user).await.unwrap().unwrap(), before);
    sqlx::query("INSERT INTO sessions (token_hash,user_id,csrf_token,expires_at) VALUES ('upgrade-session',$1,'csrf',clock_timestamp() + interval '1 hour')")
        .bind(user).execute(&pool).await.unwrap();
    let versions: Vec<i64> =
        sqlx::query_scalar("SELECT version FROM _sqlx_migrations WHERE success ORDER BY version")
            .fetch_all(&pool)
            .await
            .unwrap();
    assert_eq!(versions, vec![202610090001, 202610090002]);

    // A release must fail closed if an applied migration has been rewritten.
    sqlx::query(
        "UPDATE _sqlx_migrations SET checksum = decode('00', 'hex') WHERE version = 202610090001",
    )
    .execute(&pool)
    .await
    .unwrap();
    assert!(matches!(
        db.migrate().await,
        Err(sqlx::migrate::MigrateError::VersionMismatch(202610090001))
    ));
    assert_eq!(db.load(user).await.unwrap().unwrap(), before);
    assert_eq!(
        sqlx::query_scalar::<_, i64>("SELECT count(*) FROM sessions WHERE user_id=$1")
            .bind(user)
            .fetch_one(&pool)
            .await
            .unwrap(),
        1
    );
}

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
