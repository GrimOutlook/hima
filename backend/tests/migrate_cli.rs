use std::process::Command;

#[test]
fn migrator_never_falls_back_to_runtime_credentials() {
    let output = Command::new(env!("CARGO_BIN_EXE_migrate"))
        .env_remove("MIGRATION_DATABASE_URL")
        .env("DATABASE_URL", "postgres://runtime:secret@localhost/hima")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert_eq!(
        String::from_utf8(output.stderr).unwrap().trim(),
        "hima-api: MIGRATION_DATABASE_URL must be set"
    );
}

#[test]
fn migrator_uses_its_own_url_without_leaking_credentials() {
    let output = Command::new(env!("CARGO_BIN_EXE_migrate"))
        .env_remove("DATABASE_URL")
        .env("MIGRATION_DATABASE_URL", "invalid://migration-secret")
        .output()
        .unwrap();
    assert!(!output.status.success());
    assert_eq!(
        String::from_utf8(output.stderr).unwrap().trim(),
        "hima-api: could not connect to PostgreSQL; check MIGRATION_DATABASE_URL and database availability"
    );
}
