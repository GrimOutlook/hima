use std::{env, net::SocketAddr};
use tracing_subscriber::EnvFilter;

pub struct Config {
    pub bind_addr: SocketAddr,
    pub log_filter: EnvFilter,
}

impl Config {
    pub fn from_env() -> Result<Self, String> {
        Self::parse(read("HIMA_BIND_ADDR")?, read("RUST_LOG")?)
    }

    fn parse(bind: Option<String>, log: Option<String>) -> Result<Self, String> {
        let bind_addr = bind
            .as_deref()
            .unwrap_or("127.0.0.1:3000")
            .parse()
            .map_err(|_| {
                "HIMA_BIND_ADDR must be an IP address and port (for example 127.0.0.1:3000)"
                    .to_owned()
            })?;
        let log_filter = EnvFilter::try_new(log.as_deref().unwrap_or("info"))
            .map_err(|_| "RUST_LOG must contain valid tracing filter directives (for example info,hima_api=debug)".to_owned())?;
        Ok(Self {
            bind_addr,
            log_filter,
        })
    }
}

fn read(name: &str) -> Result<Option<String>, String> {
    match env::var(name) {
        Ok(value) => Ok(Some(value)),
        Err(env::VarError::NotPresent) => Ok(None),
        Err(env::VarError::NotUnicode(_)) => Err(format!("{name} must be valid Unicode")),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn defaults_and_overrides() {
        assert_eq!(
            Config::parse(None, None).unwrap().bind_addr.to_string(),
            "127.0.0.1:3000"
        );
        assert_eq!(
            Config::parse(
                Some("[::1]:4000".into()),
                Some("warn,hima_api=debug".into())
            )
            .unwrap()
            .bind_addr
            .to_string(),
            "[::1]:4000"
        );
    }

    #[test]
    fn invalid_values_are_actionable_and_redacted() {
        let secret = "secret-value!";
        for (bind, log, variable) in [
            (Some(secret.into()), None, "HIMA_BIND_ADDR"),
            (None, Some("hima_api=secret-value!".into()), "RUST_LOG"),
        ] {
            let error = Config::parse(bind, log).err().unwrap();
            assert!(error.contains(variable));
            assert!(!error.contains(secret));
        }
    }
}
