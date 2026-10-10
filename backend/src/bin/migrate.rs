use hima_api::db::Database;

#[tokio::main]
async fn main() -> std::process::ExitCode {
    let result = async {
        let url = std::env::var("MIGRATION_DATABASE_URL")
            .map_err(|_| "MIGRATION_DATABASE_URL must be set")?;
        let db = Database::connect(&url).await.map_err(
            |_| "could not connect to PostgreSQL; check MIGRATION_DATABASE_URL and database availability",
        )?;
        db.migrate()
            .await
            .map_err(|_| "database migration failed")?;
        db.close().await;
        Ok::<_, &str>(())
    }
    .await;
    match result {
        Ok(()) => std::process::ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("hima-api: {message}");
            std::process::ExitCode::FAILURE
        }
    }
}
