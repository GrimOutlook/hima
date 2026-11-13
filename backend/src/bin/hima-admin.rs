//! Interactive administrative provisioning; passwords are never command arguments.
use hima_api::{auth::local::provision, db::Database};

#[tokio::main]
async fn main() -> std::process::ExitCode {
    match run().await {
        Ok(()) => {
            println!("Account updated. Password resets revoke all account sessions.");
            std::process::ExitCode::SUCCESS
        }
        Err(error) => {
            eprintln!("hima-admin: {error}");
            std::process::ExitCode::FAILURE
        }
    }
}
async fn run() -> Result<(), String> {
    let args: Vec<_> = std::env::args().skip(1).collect();
    let [command, username] = args.as_slice() else {
        return Err("Usage: hima-admin <create-user|reset-password> <username>".into());
    };
    let reset = match command.as_str() {
        "create-user" => false,
        "reset-password" => true,
        _ => return Err("Usage: hima-admin <create-user|reset-password> <username>".into()),
    };
    hima_api::auth::local::normalize_username(username)?;
    let password = rpassword::prompt_password("Password: ")
        .map_err(|_| "Could not read password from terminal")?;
    let confirmation = rpassword::prompt_password("Confirm password: ")
        .map_err(|_| "Could not read confirmation from terminal")?;
    if password != confirmation {
        return Err("Passwords do not match".into());
    }
    let url = std::env::var("MIGRATION_DATABASE_URL")
        .map_err(|_| "MIGRATION_DATABASE_URL is required for administration")?;
    let db = Database::connect(&url)
        .await
        .map_err(|_| "Could not connect to database")?;
    provision(&db, username, password, reset).await
}
