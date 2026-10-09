use hima_api::{config::Config, server};
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
    axum::serve(listener, server::router())
        .with_graceful_shutdown(server::shutdown_signal())
        .await
        .map_err(|_| "HTTP server failed".to_owned())
}
