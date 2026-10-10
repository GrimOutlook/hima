use hima_api::{
    config::{Config, OidcConfig},
    server,
};
use std::process::ExitCode;

#[tokio::main]
async fn main() -> ExitCode {
    match run().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(message) => {
            eprintln!("hima-api: {message}");
            ExitCode::FAILURE
        }
    }
}

async fn run() -> Result<(), String> {
    let config = Config::from_env()?;
    let app = match OidcConfig::from_env()? {
        Some(oidc) => {
            let db = hima_api::db::Database::connect(&oidc.database_url)
                .await
                .map_err(|_| "could not connect to authentication database")?;
            let auth = hima_api::auth::Auth::new(
                db,
                &oidc.issuer,
                oidc.client_id,
                oidc.client_secret,
                &oidc.public_origin,
            )
            .await?;
            server::with_auth(auth)
        }
        None => server::router(),
    };
    tracing_subscriber::fmt()
        .with_env_filter(config.log_filter)
        .json()
        .try_init()
        .map_err(|_| "could not initialize structured logging".to_owned())?;
    let listener = tokio::net::TcpListener::bind(config.bind_addr)
        .await
        .map_err(|_| {
            format!(
                "could not bind to {}: check that the address is available and the port is free",
                config.bind_addr
            )
        })?;
    tracing::info!(address = %listener.local_addr().map_err(|_| "could not read listening address")?, "server listening");
    server::serve(listener, app, server::shutdown_signal())
        .await
        .map_err(|_| "HTTP server failed".to_owned())
}
