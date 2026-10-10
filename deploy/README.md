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
CREATE ROLE hima_migrate LOGIN;
CREATE ROLE hima LOGIN;
```

Set both passwords interactively with `psql`'s `\password hima` and
`\password hima_migrate` (avoids shell history
and SQL logs), then:

```sql
CREATE DATABASE hima OWNER hima_migrate;
\connect hima
REVOKE ALL ON DATABASE hima FROM PUBLIC;
GRANT CONNECT ON DATABASE hima TO hima;
REVOKE ALL ON SCHEMA public FROM PUBLIC;
ALTER SCHEMA public OWNER TO hima_migrate;
GRANT USAGE ON SCHEMA public TO hima;
ALTER DEFAULT PRIVILEGES FOR ROLE hima_migrate IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO hima;
-- Also covers existing tables when adopting this setup:
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO hima;
```

The migration role owns the database, schema and migration-created tables; the
runtime role has only connection, schema usage and table DML rights, with no
role membership, ownership, CREATE, TRUNCATE or DDL permissions. The user ID uses
an identity column, so runtime inserts need no direct sequence grants.
Neither role needs `CREATEDB` or superuser.
For an existing deployment, stop the API and transfer database/schema/table
ownership from `hima` to `hima_migrate` as administrator (`REASSIGN OWNED BY hima
TO hima_migrate` in this dedicated database), then apply the grants above.
Limit `pg_hba.conf` access to the application host with SCRAM
authentication. Integration tests use a separate disposable role with `CREATEDB`.

At the OIDC provider register an Authorization Code client, S256 PKCE, `openid`
scope, and query-mode callback **`https://hima.example/auth/callback`**. Enable
client-secret-basic for a confidential client. Set `HIMA_PUBLIC_ORIGIN` to exactly
`https://hima.example` (no trailing path); use the same origin in the browser and
proxy. Provider discovery/JWKS/token endpoints must be reachable by the backend;
the authorization endpoint must be reachable by browsers. Keep the issuer/client
identity stable across releases so users retain their existing accounts.

Create separate system users/groups `hima` and `hima-migrate` with no login, then install
[`api.env.example`](api.env.example) as `/etc/hima/api.env`, root-owned mode 0600.
Edit it with real database credentials and the optional OIDC client secret. URL
encode reserved characters in the database password. systemd reads the file
before changing user. For a secret manager, render this file on the host with
the same permissions before starting the service. Never put secrets in Git,
Nix expressions/store paths, command-line arguments, `dist/`, or `VITE_` variables.
The application reads environment variables; it does not load `.env` itself.
Install [`migrate.env.example`](migrate.env.example) as `/etc/hima/migrate.env`,
root-owned mode 0600, with the migration role's `MIGRATION_DATABASE_URL`.
Never include that URL in `api.env`. The separate migration service/user keeps
DDL credentials out of the API environment and away from its Unix user.
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
sudo install -m 0644 deploy/hima-migrate.service /etc/systemd/system/hima-migrate.service
sudo systemctl daemon-reload
sudo systemctl enable --now hima-api
sudo systemctl status hima-api
sudo journalctl -u hima-api -n 50
sudo systemd-analyze security hima-api.service hima-migrate.service
```

The output links are GC roots. Keep them for every retained release. For native
builds use the same layout with actual files, readable/executable by `hima` and
nginx and the migration user. The API requires the one-shot migration service,
which uses only `migrate.env` and exits after applying migrations. SQLx applies
only pending migrations and uses a database migration lock; failures prevent
startup. Explicitly run the migration service during updates/recovery as below;
do not rely on dependency activation to rerun it during an API restart.
Startup also requires database connectivity and
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
HTML and SPA routes use `Cache-Control: no-cache` so a deployment does not leave
a cached old index. Vite's content-hashed files under `/assets/` use
`public, max-age=31536000, immutable`; missing assets return 404 instead of SPA
HTML and do not receive that cache policy. The unhashed `/assets/favicon.svg`
is an exact-match exception using `no-cache`. Keep future unhashed files outside
`/assets/` or add an explicit revalidation exception for them.

The file's `map` and `limit_req_zone` directives belong directly in the **http
context**, outside either `server` block. Two 10 MiB shared-memory zones track
the binary client address across nginx workers. Auth routes share a 6 requests/minute
budget with 5 excess requests allowed as an immediate burst; API routes share a
separate 10 requests/second budget with 20 excess requests allowed. `nodelay`
forwards allowed bursts immediately; excess requests return **429** before any
upstream session lookup or login database work. Empty map keys exclude the other
route family from each zone. Bare `/auth` and `/api` are included; static files
are not rate limited. Budgets refill over time rather than resetting at a fixed
minute boundary. Clients should back off on 429, and operators can tune rates
and bursts for expected traffic (including users sharing a NAT address).

The key uses nginx's client address, never an untrusted `X-Forwarded-For` header.
If deploying behind another proxy, configure nginx's real-IP module with only
explicitly trusted proxy addresses before using this recipe; otherwise all users
behind that proxy share a budget. Keep the Rust port private so requests cannot
bypass nginx's limits.

Run the database-independent rate-limit regression test with nginx, openssl and
Python 3 on PATH:

```sh
python3 deploy/test_rate_limits.py
```

It exercises the shipped configuration over HTTPS, verifies rejected requests
never reach a counting upstream, and checks separate route/client budgets,
spoofed forwarding headers, static serving, security headers and budget recovery.
It also checks immutable JS/CSS/font caching (including 304 responses), HTML and
favicon revalidation, and missing-asset 404s without long-lived caching.

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
3. Switch `current` atomically, run migrations, then restart the API:

   ```sh
   sudo ln -s /opt/hima/releases/NEW_RELEASE /opt/hima/current.next
   sudo mv -Tf /opt/hima/current.next /opt/hima/current
   sudo systemctl start hima-migrate && sudo systemctl restart hima-api
   ```

4. Run the health and login/save/restart checks below. After secret or environment
   changes, also restart the API. Provider signing keys refresh automatically
   every hour and on an unknown key or failed signature (at most once per minute
   per API process). Successful refreshes replace the key set, removing revoked
   keys. Failed refreshes retain the previous keys and emit a warning; monitor
   these warnings during provider outages. Signing-key rotation needs no restart.

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
pg_dump -h 127.0.0.1 -U hima_migrate -d hima --format=custom --no-owner --no-acl --file=hima.dump
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
createdb -h 127.0.0.1 -U postgres --owner=hima_migrate hima_restore
pg_restore -h 127.0.0.1 -U hima_migrate -d hima_restore --no-owner --no-acl --exit-on-error hima.dump
# As administrator, apply the database/schema/default/table grants above to
# hima_restore before checking access as the runtime role.
psql -h 127.0.0.1 -U hima -d hima_restore -c 'SELECT count(*) FROM planners;'
psql -h 127.0.0.1 -U hima -d hima_restore -c 'SELECT version, success FROM _sqlx_migrations ORDER BY version;'
```

For actual recovery stop **all** API instances first. Restore to a fresh database
owned by `hima_migrate`, reapply the schema and default/table grants above in it,
point both connection URLs to it via their separate secret files, and run
`systemctl start hima-migrate && systemctl start hima-api` with the
release compatible with the backup. Its migrator applies any pending forward
migrations; verify logs and acceptance checks before reopening traffic. Do not
restore over a database with active writes. Roles aren't included in `pg_dump`:
reprovision both roles/passwords if recovering to a new server. Keep the
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
