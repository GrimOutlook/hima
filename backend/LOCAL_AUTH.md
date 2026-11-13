# Local username/password accounts

Local authentication is optional and **off by default**. It can replace OIDC or
run alongside the existing single OIDC provider. There is no public registration,
email verification/recovery, automatic account linking, or MFA. Administrators
create accounts and reset forgotten passwords using an interactive CLI.

## Local-only development

Start PostgreSQL 17 as described in the root README, then in the repository root:

```sh
export HIMA_LOCAL_AUTH=true
export DATABASE_URL=postgres://postgres:hima-dev@127.0.0.1:5432/hima
export HIMA_PUBLIC_ORIGIN=http://127.0.0.1:5173
# Remove OIDC settings when using local authentication alone.
unset HIMA_OIDC_ISSUER HIMA_OIDC_CLIENT_ID HIMA_OIDC_CLIENT_SECRET

MIGRATION_DATABASE_URL="$DATABASE_URL" \
  cargo run --locked --manifest-path backend/Cargo.toml --bin migrate
MIGRATION_DATABASE_URL="$DATABASE_URL" \
  cargo run --locked --manifest-path backend/Cargo.toml --bin hima-admin -- create-user alice
cargo run --locked --manifest-path backend/Cargo.toml --bin hima-api
```

The CLI prompts twice without echoing the password. Do not pass passwords as
arguments, put them in environment variables, or paste them into SQL commands.
In another terminal run `pnpm run dev`, visit `http://127.0.0.1:5173`, and choose
**Sign in with password**. Keep `127.0.0.1` consistent: `localhost` is a different
origin for cookies and CSRF verification.

Environment files are not loaded automatically. Do not expose credentials through
`VITE_` variables. If using the existing OIDC `.env.example`, remove its OIDC
variables for local-only operation before sourcing it.

## Configuration and coexistence

| Variable | Behavior |
| --- | --- |
| `HIMA_LOCAL_AUTH` | Only `true` or `false` accepted; absent means `false`. Other values fail startup. |
| `HIMA_PUBLIC_ORIGIN` | Required when local auth is enabled. HTTPS origin, without path/query/fragment; HTTP allowed only for loopback development. |
| `DATABASE_URL` | Required runtime PostgreSQL URL when local auth is enabled. |
| `MIGRATION_DATABASE_URL` | Required by the migrator and administrative CLI; use the administrative role, not a browser/build variable. |

Keep existing OIDC settings and set `HIMA_LOCAL_AUTH=true` to offer both login
methods. Partial or invalid OIDC configuration still fails startup; local login
never silently bypasses a broken OIDC configuration. With local auth disabled,
local login is unavailable, even if credential rows remain in the database.
Disabling a login method does not revoke its existing application sessions; revoke
sessions explicitly if disabling access rather than merely hiding a login method.

Username rules are explicit: 3–64 ASCII characters, first character a letter or
digit, remaining characters letters, digits, `_`, `.`, or `-`. ASCII letters are
lowercased; whitespace is rejected rather than trimmed. `Alice` and `alice` name
the same local account. Passwords are not trimmed or normalized: use at least 15
Unicode characters and at most 1024 UTF-8 bytes. Long passphrases and password
managers are encouraged.

Local users have separate IDs in the reserved `urn:hima:local` identity namespace.
An OIDC account with the same username or email remains a different account and
planner. This feature does not migrate/link existing accounts; transfer planner
data explicitly using export/import if needed.

## HTTP endpoints

All responses retain the existing no-store policy. The frontend uses same-origin
requests; no cross-origin CORS access is enabled.

| Method/path | Contract |
| --- | --- |
| `GET /auth/options` | Public `{ "local": boolean, "oidc": boolean }` flags; no secrets. Both false when auth is unconfigured. |
| `POST /auth/local/login` | JSON `{ "username": "…", "password": "…" }` with exact public Origin; success sets/rotates the session cookie and returns 303 to `/`. Invalid credentials return generic 401, unavailable local auth 503, admission saturation 429. |
| `GET /auth/local/account` | Authenticated `{ "local": boolean }` indicating whether password changes are available for the current account. |
| `POST /auth/local/password` | JSON `{ "current_password": "…", "new_password": "…" }`, existing session, exact Origin and `X-CSRF-Token`; success revokes all account sessions, clears cookies and returns 303 to `/`. Invalid new-password policy returns 400. |

Existing `/api/me`, planner and logout contracts are unchanged.

## Administrative recovery

For packaged deployments use `backend/bin/hima-admin`; for source development:

```sh
MIGRATION_DATABASE_URL="$ADMIN_DATABASE_URL" \
  cargo run --locked --manifest-path backend/Cargo.toml --bin hima-admin -- reset-password alice
```

Resetting a password atomically updates the hash and deletes **all application
sessions for that user**, including other devices. It does not change planner data
or affect other accounts. The user must log in with the replacement password.
Creating an existing username fails; resetting a missing user fails. There is no
web-based forgotten-password flow or public account creation endpoint.

Authenticated local users can choose **Change password**, supplying their current
password and confirming the new password. Save/export unsaved planner work first;
the UI disables password changes while planner saves are not acknowledged. A
successful change signs out every session, including the current browser. Other
tabs retain the existing session-expiry/export behavior. OIDC-only accounts do not
see this control.

## Production and security

- Run migrations from the same release before the API. Existing users, planners,
  sessions and OIDC configuration remain valid. The additive migration creates
  `local_credentials` and the bounded `local_login_admission` table.
- Use the runtime database DML grants described in `deploy/README.md` for the new
  tables; use the migration/admin role only for migrations and provisioning.
- Deploy behind the same-origin HTTPS reverse proxy in `deploy/nginx.conf`.
  Preserve Origin, cookies and CSRF headers, retain its per-client auth rate limits,
  and keep the backend private. No additional proxy route is needed.
- Password hashes use Argon2id v19 (19 MiB memory, two iterations, one lane) and
  independently generated random salts. Hashes are sensitive: protect database
  access, backups, replicas and SQL logs; a leak permits offline guessing.
- Hashing/verification runs on blocking workers, with at most two operations per
  API process. Permits remain held if an HTTP request times out or is cancelled.
- A PostgreSQL-backed fixed window permits **30 local login/password-change
  attempts per minute across the entire deployment**, including successful
  attempts and unknown usernames. Its single row bounds attacker-controlled
  storage. Saturation returns 429; retain nginx per-client rate limiting too.
  This deliberately conservative limit suits small self-hosted instances: an
  attacker can temporarily exhaust the shared allowance, so it is not a complete
  denial-of-service defense. Multi-instance hashing concurrency is per process.
- Unknown usernames still verify a dummy hash. Credential failures use a generic
  response. Exact Origin matching plus a JSON request body protects login against
  login CSRF; password changes additionally require the existing session CSRF
  token and current password. Bodies are limited to 8 KiB and malformed credential
  requests return redacted errors.
- Login rotates/revokes the session presented by the browser. Password resets and
  changes serialize against login credential checks so a stale verification cannot
  mint a session after a committed reset. Existing cookie/idle/absolute expiry
  policies apply unchanged.
- No passwords or hashes are returned to the frontend or written to application
  logs. Passwords exist transiently in request/CLI memory; this is not a promise of
  secure memory erasure. Administrative access remains a trusted capability.

Back up PostgreSQL using the deployment procedure. Backups now contain password
hashes as well as account/planner/session data. Restoring an old backup can restore
old passwords and sessions; after recovery, reset affected credentials/revoke
sessions as appropriate. Do not roll back to an old API expecting it to support
local login. Disabling `HIMA_LOCAL_AUTH` leaves credentials available for future
reenabling; it does not securely erase them or historical backups.

## Verification

```sh
cargo test --locked --manifest-path backend/Cargo.toml
DATABASE_URL=postgres://postgres:hima-dev@127.0.0.1:5432/hima \
  cargo test --locked --manifest-path backend/Cargo.toml --test local_auth -- --ignored
pnpm test src/LocalAuth.test.tsx src/useStoredPlanner.test.tsx
```

The PostgreSQL suite needs a disposable database role with `CREATEDB`; SQLx creates
isolated databases. It covers local credentials, CSRF, session rotation/revocation,
password changes/reset (including a reset racing with login), concurrent shared throttling, disabled mode, redaction and per-user
planner isolation. Offline tests cover username/password rules, salted Argon2id
verification and bounded hashing workers. Existing OIDC suites remain required.

For a browser smoke test, create two accounts, log in, save different planners,
reload/restart the backend and confirm persistence/isolation. Change one password
with two browser sessions open: both must require login again, the old password
must fail, and the other account must remain signed in. Repeat recovery with the
CLI. With both modes enabled, verify the OIDC sign-in path still works; with local
mode disabled, verify no local login form is offered.
