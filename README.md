# hima

A small, browser-based PPL planner built with React and TypeScript. Create leave pools, add one-time or recurring accruals with optional end dates, including yearly nth-weekday schedules, set date-ranged balance caps, log leave events with hours split across pools for each day, see date-by-date pool usage by event, check your projected balance on any date, and chart the combined balance or a specific pool over the past year and the year ahead.

All amounts are entered in hours. Your pools and events are saved in this browser's local storage. Use **Export JSON** to download a backup or **Import JSON** to restore one; importing replaces the data saved in this browser.

Use the graph's **Show** dropdown to choose which pools appear in the chart. These choices are saved across reloads and included in JSON backups. Selecting an event temporarily shows its pools; clearing the event restores your saved choices.

For holidays, create a pool (for example, **Holidays**) and enable **Holiday Mode** in its pool settings. This applies to the starting balance and new one-time additions or repeating schedules, including a fixed yearly date or an nth weekday each year. Changing the setting leaves existing additions unchanged. Hours can be used on the holiday itself; the unused portion expires the next day. Leave uses expiring hours before regular hours in the same pool. Expiration does not count as leave usage or erase other hours, and lifetime accrued still includes the hours originally added.

## Run locally

Install Node.js 22.13+ and pnpm 12.10.1 (the version declared in `package.json`), then install the dependencies and start the development server. This project uses pnpm; `pnpm-lock.yaml` is the dependency lockfile to keep committed when updating dependencies. The Nix development shell includes both Node.js and pnpm.

TypeScript stays on the latest 6.0 release because `typescript-eslint` does not yet support TypeScript 7.

```sh
pnpm install --frozen-lockfile
pnpm run dev
```

Check TypeScript code, React hook dependencies, and JSX accessibility, run the tests, and create a production build with:

```sh
pnpm run lint
pnpm test
pnpm run build
```

The generated site is written to `dist/`. Run `pnpm run preview` to serve the production build locally.

### Build with Nix

With Nix flakes enabled, run `nix build` to build the production site using the pinned Node.js and pnpm dependencies. The static site is available in `result/dist/`, ready to serve with a static web server. Package outputs support `x86_64-linux` and `aarch64-linux`.

Run `nix develop` for the Node.js, pnpm, and Rust development shell, or `nix run` to start the development server after installing dependencies with `pnpm install --frozen-lockfile`.

When updating `pnpm-lock.yaml`, also update the `pnpmDeps` hash in `flake.nix`: temporarily set it to `pkgs.lib.fakeHash`, run `nix build`, then replace it with the actual hash printed in the hash-mismatch error. New files must be tracked by Git to be included in a local Git-based flake build.

Tests use Node for pure model, settings, and store mutation checks. Component and hook test files opt into jsdom with `@vitest-environment jsdom`. Regression coverage includes fractional-hour balances, shared per-pool history dates, independent graph visibility and total exclusion, modal validation and focus, and calendar selection and keyboard navigation. Run a focused suite with, for example, `pnpm test src/App.test.tsx src/CalendarPicker.test.tsx`.

The app does not need an account or a server. Pools and events are stored in this browser's local storage; existing `hima.store.v1` data is retained and older event formats are migrated when loaded.

Saved planner data and JSON backups carry a numeric `version` (currently `1`). Unversioned data is treated as the legacy schema and migrated to version 1, including older event formats. Unsupported versions are rejected on import; unreadable saved data follows the browser-storage recovery path described by the app.

### Rust API service

The independent Axum/Tokio service lives in `backend/`. Install stable Rust (edition 2024 support required), or enter `nix develop`, then run in a second terminal alongside `pnpm run dev`:

```sh
cargo run --locked --manifest-path backend/Cargo.toml
curl http://127.0.0.1:3000/health
```

The health response is HTTP 200 with `Content-Type: application/json` and `{"status":"ok"}`. This is a liveness check; no database is required in the unconfigured service. The frontend still uses browser storage. The SQLx `db` module provides PostgreSQL persistence and the `planner` module validates documents. The backend supports OIDC authentication and authenticated GET/PUT `/api/planner`; see [the HTTP contract](backend/DOCUMENT.md#authenticated-http-contract). Frontend integration is follow-up work.

Configuration is read from the process environment (no automatic `.env` loading):

| Variable | Default | Description |
| --- | --- | --- |
| `HIMA_BIND_ADDR` | `127.0.0.1:3000` | IP address and port, including bracketed IPv6 such as `[::1]:3000`. |
| `RUST_LOG` | `info` | Tracing filter directives, for example `info,hima_api=debug`. |

For example, `HIMA_BIND_ADDR=127.0.0.1:4000 cargo run --locked --manifest-path backend/Cargo.toml` changes the port. Invalid configuration exits nonzero with the variable name and expected format, without echoing its value. Bind failures explain how to check the address and port. Logs are structured JSON and include request method, status, and duration; request URLs, headers, bodies, and environment values are not logged. Ctrl-C or SIGTERM initiates graceful shutdown.

API errors use an HTTP error status and a JSON envelope:

```json
{"error":{"code":"not_found","message":"The requested endpoint does not exist."}}
```

Unknown routes return 404 (`not_found`); unsupported methods on registered routes return 405 (`method_not_allowed`). `code` is machine-readable and `message` is a safe human-readable description. HEAD requests follow HTTP semantics and omit the response body.

Run backend checks independently of Vite:

```sh
cargo fmt --manifest-path backend/Cargo.toml --check
cargo clippy --manifest-path backend/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path backend/Cargo.toml --locked
cargo build --manifest-path backend/Cargo.toml --locked
```

Commit `backend/Cargo.lock` when changing Rust dependencies. CI runs these checks alongside the frontend checks.

### PostgreSQL storage

Use PostgreSQL 17 (also used in CI). For a local development database:

```sh
docker run -d --name hima-postgres -e POSTGRES_PASSWORD=hima-dev -e POSTGRES_DB=hima -p 127.0.0.1:5432:5432 -v hima-postgres-data:/var/lib/postgresql/data postgres:17
export DATABASE_URL=postgres://postgres:hima-dev@127.0.0.1:5432/hima
cargo run --locked --manifest-path backend/Cargo.toml --bin migrate
```

The migration command connects using `DATABASE_URL` and applies embedded SQLx
migrations from `backend/migrations/`; rerunning is safe. The database must exist,
and the migration role needs schema/table creation privileges. Deployment should
run migrations before starting services that use storage. The HTTP liveness service
does not automatically migrate; it reads `DATABASE_URL` when OIDC is enabled. Production connection URLs
should use the deployment's database credentials and TLS configuration.

Storage callers use `Database::connect`, then the per-user `ensure_user`, `load`,
and validated `save(user_id, document, expected_revision)` methods. Data lives in PostgreSQL, so restarting backend
processes does not discard planners. See [the document contract](backend/DOCUMENT.md)
for version-1 compatibility, synchronized preferences, validation, and revision semantics.

Run the actual PostgreSQL integration test against a disposable test instance
(the role must have `CREATEDB`; SQLx creates an isolated test database):

```sh
DATABASE_URL=postgres://postgres:hima-dev@127.0.0.1:5432/hima cargo test --locked --manifest-path backend/Cargo.toml --test postgres -- --ignored
```

Regular `cargo test` runs offline validation and HTTP tests; the explicitly ignored
PostgreSQL suite runs separately in CI, covering fresh migrations, constraints,
per-user isolation, atomic revisions, invalid-write preservation, and reconnect persistence.

### OIDC login and browser sessions

Register an OIDC **Authorization Code** client with **S256 PKCE** at your provider.
Enable discovery and signed ID tokens (normally RS256). Register the exact callback
URL `https://hima.example/auth/callback`; use the actual public origin of your site.
For a confidential client, use client-secret-basic authentication. Public clients
can omit the secret. The service requests only the `openid` scope and identifies
accounts by the verified `(issuer, subject)` pair, never by email.

Run the database migrations above before starting the configured service:

| Variable | Description |
| --- | --- |
| `HIMA_OIDC_ISSUER` | Exact provider issuer, for example `https://id.example/realms/hima`. Enables OIDC; discovery must succeed at startup. |
| `HIMA_OIDC_CLIENT_ID` | Registered client ID; required when OIDC is enabled. |
| `HIMA_OIDC_CLIENT_SECRET` | Optional confidential-client secret, supplied only to the backend process. |
| `HIMA_PUBLIC_ORIGIN` | Public site origin, for example `https://hima.example`, with no path/query/fragment or credentials. Required when OIDC is enabled. |
| `DATABASE_URL` | PostgreSQL connection URL; required when OIDC is enabled. |

These settings are process environment variables; do not prefix them with `VITE_`
or put them into frontend build configuration. Partial OIDC configuration fails
startup. With OIDC unconfigured, `/auth/login` and `/auth/callback` return 503
`auth_unavailable`; `/api/me` and `/auth/logout` return 401 `unauthenticated`.
Discovery/signing keys are loaded at startup; restart the service after provider
signing-key rotation if the provider introduces a key absent from the discovered JWKS.

Serve the static frontend and proxy `/auth/*` and `/api/*` to the backend under
the **same public HTTPS origin**. The proxy must preserve Cookie, Set-Cookie,
Origin, and `X-CSRF-Token` headers and query parameters, and must not cache auth/API
responses or log callback query strings. Keep the backend listening on a private
interface. Cookie security and callback URLs use `HIMA_PUBLIC_ORIGIN`, not Host or
forwarded headers, so TLS termination at the proxy still produces Secure cookies.
HTTP is accepted only for loopback origins/provider endpoints in local development
(for example `http://localhost:3000/auth/callback`); these use unprefixed development
cookies without Secure. Use a same-origin development proxy for browser access.

Endpoints:

- **GET `/auth/login`** creates a ten-minute, server-side login transaction and
  redirects to the provider with random state/nonce and S256 PKCE. The transaction
  is bound to an HTTP-only browser cookie. Starting another login in the same browser
  replaces that cookie; only the latest flow can complete.
- **GET `/auth/callback`** atomically consumes the matching transaction, exchanges
  the code on the backend, verifies signature/algorithm, issuer, audience, authorized
  party, nonce, expiry, issue time, and token/code hashes when supplied, then creates
  a session and redirects to `/`. Malformed, expired, replayed, provider-error,
  or otherwise invalid callbacks return 400 `invalid_callback` without a session.
  Issue time allows at most 60 seconds ahead or 11 minutes behind the service clock.
- **GET `/api/me`** returns `{"user_id":123,"csrf_token":"..."}` for a valid
  session, or 401 `unauthenticated`. Restore login by calling this endpoint on page
  load. The CSRF token is an application token, not a provider token.
- **POST `/auth/logout`** requires the session, an exact `Origin` matching
  `HIMA_PUBLIC_ORIGIN`, and `X-CSRF-Token` from `/api/me`. It deletes the current
  session, expires browser cookies, and redirects to `/`. Missing/mismatched CSRF
  data returns 403 `csrf_failed`; an absent/expired session returns 401. GET logout
  is unsupported. Application logout does not end the provider's SSO session;
  a later login may authenticate without prompting at the provider.

Unsafe `/api/*` requests use the same session/Origin/CSRF middleware. Browser clients
must send the CSRF header for mutations; no cross-origin CORS access is enabled.
Auth/API responses have `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
Production cookies are `__Host-hima-session` and `__Host-hima-login`, with Secure,
HttpOnly, SameSite=Lax, Path=/, and no Domain attribute. The callback must use a
top-level GET redirect (`response_mode=query`), so Lax permits the login cookie.

Sessions have 256-bit opaque random tokens; PostgreSQL stores only their SHA-256
hashes, user IDs, CSRF tokens, and expiration. Sessions survive backend restarts and
expire **seven days after login**, without sliding renewal. Login rotates and revokes
the session previously presented by that browser. Other devices retain their own
sessions. Expired rows are pruned when a login starts; expiration is checked on every
access independently of cleanup. Login transactions store PKCE verifiers and nonces
only on the server. Provider access/ID tokens are verified in memory and discarded;
no provider token or client secret is returned to the browser or saved in localStorage.

The controlled-provider integration test uses real RSA-signed tokens, checks the
code exchange and PKCE, and exercises PostgreSQL session restoration, rotation,
expiration, logout, CSRF, HTTPS cookie controls, and invalid OIDC responses:

```sh
DATABASE_URL=postgres://postgres:hima-dev@127.0.0.1:5432/hima cargo test --locked --manifest-path backend/Cargo.toml --test auth -- --ignored
```

Both database integration suites run in CI against PostgreSQL 17. The auth suite
also exercises the planner over actual TCP HTTP, including concurrent first saves
and updates, cross-user isolation, invalid-write preservation, session expiry,
and CSRF enforcement.

## License

hima is licensed under the [MIT License](LICENSE). Third-party dependencies, including the bundled fonts, retain their own licenses.
