use std::process::{Command, Output};

fn startup(settings: &[(&str, &str)]) -> Output {
    let mut command = Command::new(env!("CARGO_BIN_EXE_hima-api"));
    for key in [
        "HIMA_LOCAL_AUTH",
        "HIMA_PUBLIC_ORIGIN",
        "DATABASE_URL",
        "HIMA_OIDC_ISSUER",
        "HIMA_OIDC_CLIENT_ID",
        "HIMA_OIDC_CLIENT_SECRET",
    ] {
        command.env_remove(key);
    }
    command.envs(settings.iter().copied()).output().unwrap()
}
#[test]
fn local_mode_requires_explicit_valid_configuration() {
    for (settings, expected) in [
        (
            vec![("HIMA_LOCAL_AUTH", "secret-invalid-value")],
            "HIMA_LOCAL_AUTH",
        ),
        (vec![("HIMA_LOCAL_AUTH", "true")], "DATABASE_URL"),
        (
            vec![
                ("HIMA_LOCAL_AUTH", "true"),
                ("DATABASE_URL", "secret-database-url"),
            ],
            "HIMA_PUBLIC_ORIGIN",
        ),
        (
            vec![
                ("HIMA_LOCAL_AUTH", "true"),
                ("HIMA_OIDC_CLIENT_ID", "secret-client-id"),
            ],
            "HIMA_OIDC_ISSUER",
        ),
        (
            vec![
                ("HIMA_LOCAL_AUTH", "true"),
                ("HIMA_OIDC_ISSUER", "https://issuer.example"),
            ],
            "HIMA_OIDC_CLIENT_ID",
        ),
    ] {
        let result = startup(&settings);
        assert!(!result.status.success());
        let stderr = String::from_utf8_lossy(&result.stderr);
        assert!(stderr.contains(expected), "{stderr}");
        assert!(!stderr.contains("secret-"));
    }
}
#[test]
fn admin_cli_requires_an_explicit_operation_and_username() {
    for args in [
        vec![],
        vec!["create-user"],
        vec!["unknown", "alice"],
        vec!["create-user", "alice", "DO-NOT-ECHO"],
    ] {
        let result = Command::new(env!("CARGO_BIN_EXE_hima-admin"))
            .args(args)
            .output()
            .unwrap();
        assert!(!result.status.success());
        let stderr = String::from_utf8_lossy(&result.stderr);
        assert!(stderr.contains("Usage:"));
        assert!(!stderr.contains("DO-NOT-ECHO"));
    }
}
