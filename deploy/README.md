# Production deployment

This recipe uses one Linux host, PostgreSQL 17 with persistent storage, nginx TLS
termination, and systemd. Substitute your domain, provider, paths, and passwords.
DNS must point to the host; provision and renew a trusted TLS certificate before
enabling the HTTPS server. Expose only 80/443 publicly; bind PostgreSQL and Rust
to loopback. A remote database instead needs verified TLS (for example SQLx
`sslmode=verify-full` and `sslrootcert=/etc/hima/db-ca.pem`).

## Reproducible releases

Check out a reviewed commit, retaining `flake.lock`, `pnpm-lock.yaml`, and
`backend/Cargo.lock`. With flakes enabled:

```sh
nix build .#frontend --out-link result-frontend
nix build .#backend --out-link result-backend
```

`frontend/dist/` contains the site; `backend/bin/hima-api` and
`backend/bin/migrate` are optimized release programs. The backend package runs
offline tests during its build; database tests require a disposable PostgreSQL
instance and run separately in CI. Both packages are exported for x86_64-linux
and aarch64-linux. Build on the deployment architecture (or configure a suitable
Nix remote builder). Keep Nix installed on the target and preserve the closure:
use `nix copy --to ssh://HOST .#frontend .#backend` when building elsewhere, and
create GC-rooted output links on the host. Copying only the executable is not
sufficient for a Nix package's runtime libraries.

Without Nix, install Node 22.13+, pnpm 12.10.1, and stable Rust with edition 2024
support, pkg-config and OpenSSL development headers. Record their exact versions
in your release record; Nix pins the toolchain as well as the dependencies.

```sh
pnpm install --frozen-lockfile
pnpm run lint
pnpm test
pnpm run build
cargo fmt --manifest-path backend/Cargo.toml --check
cargo clippy --manifest-path backend/Cargo.toml --locked --all-targets -- -D warnings
cargo test --manifest-path backend/Cargo.toml --locked
cargo build --manifest-path backend/Cargo.toml --release --locked --bins
```

Install `dist/` as `frontend/dist/` and the two programs from
`backend/target/release/` as `backend/bin/` within each versioned release. Native
builds require compatible runtime libraries on the deployment host. Migrations
are embedded at compile time: always use the migrator from the same release as
the API. Never edit an already-applied migration or its checksum.

## Database, provider, and secrets

Provision PostgreSQL 17 with a durable data directory/volume; do not recreate it
on API deployment. As the database administrator, run:

```sql
CREATE ROLE hima LOGIN;
```

Set its password interactively with `psql`'s `\password hima` (avoids shell history
and SQL logs), then:

```sql
CREATE DATABASE hima OWNER hima;
```

The example uses one dedicated role with database/schema ownership for embedded
migrations and runtime access. No production `CREATEDB` or superuser privilege
is needed. Limit `pg_hba.conf` access to the application host with SCRAM
authentication. Integration tests use a separate disposable role with `CREATEDB`.

At the OIDC provider register an Authorization Code client, S256 PKCE, `openid`
scope, and query-mode callback **`https://hima.example/auth/callback`**. Enable
client-secret-basic for a confidential client. Set `HIMA_PUBLIC_ORIGIN` to exactly
`https://hima.example` (no trailing path); use the same origin in the browser and
proxy. Provider discovery/JWKS/token endpoints must be reachable by the backend;
the authorization endpoint must be reachable by browsers. Keep the issuer/client
identity stable across releases so users retain their existing accounts.

Create a system user/group `hima` with no login, then install
[`api.env.example`](api.env.example) as `/etc/hima/api.env`, root-owned mode 0600.
Edit it with real database credentials and the optional OIDC client secret. URL
encode reserved characters in the database password. systemd reads the file
before changing user. For a secret manager, render this file on the host with
the same permissions before starting the service. Never put secrets in Git,
Nix expressions/store paths, command-line arguments, `dist/`, or `VITE_` variables.
The application reads environment variables; it does not load `.env` itself.
The [README configuration tables](../README.md#oidc-login-and-browser-sessions)
cover every OIDC variable; `HIMA_BIND_ADDR` and `RUST_LOG` are optional.

## Install and start

Create `/opt/hima/releases/RELEASE` and use the following layout (replace RELEASE
with the checked-out commit). For Nix outputs, run these builds **on the host**:

```sh
sudo nix build .#frontend --out-link /opt/hima/releases/RELEASE/frontend
sudo nix build .#backend --out-link /opt/hima/releases/RELEASE/backend
sudo ln -s /opt/hima/releases/RELEASE /opt/hima/current
sudo install -m 0644 deploy/hima-api.service /etc/systemd/system/hima-api.service
sudo systemctl daemon-reload
sudo systemctl enable --now hima-api
sudo systemctl status hima-api
sudo journalctl -u hima-api -n 50
```

The output links are GC roots. Keep them for every retained release. For native
builds use the same layout with actual files, readable/executable by `hima` and
nginx. `ExecStartPre` runs the release's migrator with `DATABASE_URL` before every
API start. SQLx applies only pending migrations and uses a database migration
lock; failures prevent startup. Startup also requires database connectivity and
successful OIDC discovery. The unit restarts failed processes, waits for network
startup, and sends SIGTERM for graceful shutdown. Remote/local PostgreSQL must be
ready before starting; add `After=postgresql.service` for your host's local unit
if appropriate. Missing secrets or invalid configuration will appear in the
journal and must be fixed before restarting.

Install [`nginx.conf`](nginx.conf) inside nginx's `http` configuration context;
replace domain and certificate paths. Check and reload:

```sh
sudo nginx -t
sudo systemctl reload nginx
```

The proxy routes both bare `/api` and `/auth` and their children to Rust without
path rewriting; it preserves queries, Cookie, Set-Cookie, Origin and CSRF headers.
It never caches API/auth responses. Callback query strings are excluded from
access logs and routine error logs; apply the same policy to any upstream CDN,
load balancer, or tracing system. Do not enable request/header/body debug logging.
API/auth 4xx/5xx must pass through, not become the SPA's `index.html`. Static
responses use revalidation so a deployment does not leave a cached old index.

The HTTPS server permits only TLS 1.2 and 1.3. All HTTPS responses, including
errors, send `Strict-Transport-Security: max-age=63072000; includeSubDomains`,
`X-Content-Type-Options: nosniff`, and this Content Security Policy:

```text
default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'
```

Fonts and scripts are self-hosted; framing is forbidden. HSTS covers subdomains,
so ensure they support HTTPS before deploying. It protects subsequent visits
after a browser receives the header over HTTPS, not an initial HTTP visit.
When adding a location with its own `add_header`, repeat all three security
headers with `always`, as the static location does: nginx otherwise drops their
server-level inheritance.

TLS is terminated at nginx, and the upstream is HTTP on loopback. Cookies and
OIDC redirect URIs are derived from `HIMA_PUBLIC_ORIGIN`, **not** Host,
Forwarded, or X-Forwarded-* headers. Production emits `__Host-hima-session` and
`__Host-hima-login` with Secure, HttpOnly, SameSite=Lax, Path=/ and no Domain.
Do not strip or rewrite these attributes. Mutations require an exact public
Origin and the session's `X-CSRF-Token`; HTTPS forwarding does not relax CSRF.
Controlled-provider tests cover these controls and service-state recreation.

To exercise the shipped nginx configuration locally using a temporary trusted
test certificate, built `dist/`, a controlled signed OIDC provider and an isolated
SQLx database (stop any API on port 3000):

```sh
# Requires nginx, openssl, Python 3 and cargo on PATH.
DATABASE_URL=postgres://TEST_ROLE:TEST_PASSWORD@127.0.0.1:5432/TEST_DB python3 deploy/test_https_proxy.py
```

The test checks security headers on HTML, JS/CSS and API/auth proxy errors,
TLS 1.2/1.3, HTTPS static serving, login/callback cookies, CSRF-protected
planner save, HTTP-service restart with the existing session/document, logout,
and absence of callback URLs in nginx logs. The test role needs `CREATEDB`.

## Updates and restarts

1. Build and verify a new release, including disposable-database tests.
2. Take and verify a backup as below. Review new migrations for compatibility;
   stop the API for incompatible changes. Coordinate all API instances if scaled.
3. Switch `current` atomically and restart; startup applies embedded migrations:

   ```sh
   sudo ln -s /opt/hima/releases/NEW_RELEASE /opt/hima/current.next
   sudo mv -Tf /opt/hima/current.next /opt/hima/current
   sudo systemctl restart hima-api
   ```

4. Run the health and login/save/restart checks below. After secret or environment
   changes, also restart the API. Restart after provider signing-key rotation if
   it introduces keys absent from the startup JWKS.

Planners and sessions stay in PostgreSQL. A restart does not clear either; a
session expires seven days after login, and logout/login rotation revokes only
the relevant browser session. No new per-deploy session signing secret is needed.
Keep the public origin stable: changing cookie origins or using a different
database prevents existing browsers from restoring sessions.

Rollback the `current` symlink only when the old binary supports the migrated
schema. There is no automatic down migration. Otherwise stop writers and restore
the verified pre-upgrade database backup, accepting loss of writes since backup.

## Backup and recovery

Back up the **whole database**, including users, planners, sessions,
login_transactions, and `_sqlx_migrations`. Browser JSON export is a planner-only
backup and cannot restore account identity or sessions. Use PostgreSQL 17 client
tools with credentials in a mode-0600 `.pgpass`/`PGPASSFILE`, not inline passwords.
These commands assume a local server and the dedicated role:

```sh
umask 077
pg_dump -h 127.0.0.1 -U hima -d hima --format=custom --no-owner --no-acl --file=hima.dump
pg_restore --list hima.dump
```

`pg_dump` provides a consistent online snapshot; schedule it regularly, encrypt
and copy backups off-host, and monitor job success, age, and retention. Store
provider/secret-manager configuration separately and securely. The dump contains
personal planner data and active session/CSRF state; protect it like production
credentials. Use PostgreSQL WAL archiving/PITR if recovery needs to be finer than
the scheduled dump interval.

Test restoration into an isolated database, with no publicly reachable API:

```sh
# Run createdb as a database administrator, not the restricted runtime role.
createdb -h 127.0.0.1 -U postgres --owner=hima hima_restore
pg_restore -h 127.0.0.1 -U hima -d hima_restore --no-owner --no-acl --exit-on-error hima.dump
psql -h 127.0.0.1 -U hima -d hima_restore -c 'SELECT count(*) FROM planners;'
psql -h 127.0.0.1 -U hima -d hima_restore -c 'SELECT version, success FROM _sqlx_migrations ORDER BY version;'
```

For actual recovery stop **all** API instances first. Restore to a fresh database
owned by `hima`, point `DATABASE_URL` to it via the secret file, and start the
release compatible with the backup. Its migrator applies any pending forward
migrations; verify logs and acceptance checks before reopening traffic. Do not
restore over a database with active writes. Roles aren't included in `pg_dump`:
reprovision the dedicated role/password if recovering to a new server. Keep the
original database until recovery has been verified. Sessions in the dump retain
their original expiry; expired sessions require login. Recovery also rewinds
logout/revocation state to backup time. If revocation must be preserved, delete
`sessions` and `login_transactions` in the restored database before exposing it,
deliberately requiring everyone to sign in again.

## Health and acceptance checks

```sh
curl --fail http://127.0.0.1:3000/health
curl --fail https://hima.example/
curl -i https://hima.example/api/me
curl -sS -D - -o /dev/null https://hima.example/auth/login
pg_isready -h 127.0.0.1 -d hima
```

`/health` is **liveness only**, returns `{"status":"ok"}`, and does not probe the
database or OIDC. It remains private in this proxy example. Unauthenticated
`/api/me` must return 401 JSON (not the SPA); login must return 303 with an
authorization URL containing the exact HTTPS callback and a Secure login cookie.
`pg_isready` only proves the database is accepting connections. Monitor process
status, database connectivity, migration/startup failures, backup freshness, and
TLS expiry separately. A real authenticated planner read/write is the readiness
and persistence check:

1. Open the public HTTPS site, sign in, and confirm the callback redirects to `/`.
   Verify the session cookie attributes in browser developer tools.
2. Add a pool/event, wait for **Saved**, and reload. Check `/api/planner` succeeds.
3. Run `sudo systemctl restart hima-api`; reload in the same browser. The account,
   planner and session must remain intact, with no new sign-in prompt.
4. Edit again and check save succeeds; verify an invalid CSRF write returns 403.
5. Test a database restore in isolation and compare saved planner/revision data.
6. In a second tab signed into the same account, load the planner before editing
   the first tab. Save distinct edits in the first tab, then edit the second.
   The second must show a conflict and retain its draft; fetch the latest copy,
   export both copies, and explicitly choose which to keep. Reload to confirm
   the chosen document and revision. A stale write must never silently win.
7. Use a separate browser profile to sign into a second test account. It must
   not see the first account's pool/event. Save a distinct planner, then confirm
   the first profile still sees only its own data. Log out and verify `/api/me`
   and `/api/planner` return 401 and the UI no longer exposes the loaded planner.
8. On a test account, use browser developer tools to go offline after making an
   edit. The failure must retain the draft and offer export/retry. Go online and
   retry; if the earlier write committed, resolve the revision conflict explicitly.
   Confirm the final planner after reload. Repeat a local migration with an
   interrupted upload: its source must remain available until acknowledgement.

Record the deployed commit, public origin, browser/provider used, observed
planner revisions before/after restart, and pass/fail for each step in the
release record. Run against disposable test accounts and retain exported copies
while exercising conflict and failure recovery.

CI runs PostgreSQL migrations, reconnect persistence, signed-provider auth,
planner HTTP/CSRF tests, the development proxy integration, frontend checks,
and both Nix release builds. Site-specific DNS, certificates, real-provider
registration and the public browser acceptance check must be performed on your
deployment host.
