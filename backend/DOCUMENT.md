# Planner document contract (schema version 1)

The stored JSONB document is the existing `src/model.ts` Store, with optional
`settings` in the shape exported by `src/backup.ts`. It is **not** wrapped in a new
envelope. A minimal document is:

```json
{"version":1,"pools":[],"events":[],"next_id":1}
```

`version` is the document schema version. `StoredPlanner.revision` is a separate
server-managed positive 64-bit counter, initially 1 and advanced atomically on
each successful save. `updated_at` is a PostgreSQL timestamptz set on every save.
Neither metadata field belongs inside the document. Pool, event, day, allocation,
addition, recurring, and cap arrays retain their supplied order and content.

## Fields and validation

Objects reject unknown fields; required fields must be present. Optional fields
must be omitted rather than null. No coercion, rounding, dropping, or repair is
performed. `backend/src/planner.rs::validate_document` is the executable contract.

- Root: `version` (integer 1), `pools`, `events`, `next_id`, optional `settings`.
- Pool: positive integer `id`, nonblank string `name`, arrays `additions`,
  `recurring`, `caps`; optional `color` (`#RRGGBB`) and booleans
  `new_additions_expire_same_day`, `hidden_from_graph`, `hidden_from_total`.
- One-time addition: `id`, numeric `amount`, `date`; optional booleans `reset`,
  `expires_same_day`. Amount must be positive except resets may be zero.
  A reset cannot have `expires_same_day: true`.
- Recurring addition: `id`, `amount`, `cadence`, `start_date`; optional `end_date`,
  `reset`, `expires_same_day`, with the same amount/flag rules. Cadence is one of
  `Weekly`, `Fortnightly`, `Monthly`, `Yearly`, `YearlyNthWeekday`. The last requires
  integer `month` 1–12, `nth_weekday` (`First`, `Second`, `Third`, `Fourth`, `Fifth`,
  `Last`), and `weekday` (full English weekday). Other cadences omit those fields.
  To retain version-1 normalization compatibility, an end before start is accepted
  for recurring schedules (it yields no occurrences).
- Cap: `id`, numeric nonnegative `max_balance`, `start_date`, optional `end_date`.
  End cannot precede start. Inclusive cap ranges in each pool must not overlap;
  an omitted end extends indefinitely.
- Event: `id`, nonblank `name`, nonempty `days`. Day: `date`, nonempty `allocations`.
  Allocation: `pool_id` referring to an existing pool, positive numeric `hours`.
  Repeated days or allocations remain valid, matching the frontend model.
- All IDs are positive JavaScript-safe integers (maximum 9007199254740991).
  IDs are unique within each collection (pools, events, each pool's additions,
  recurring schedules, caps), matching frontend normalization. Cross-collection
  reuse is permitted. `next_id` is safe, positive, and exceeds every entity ID.
- Hours are finite numbers, nonnegative, with hundredth-hour precision, using
  the frontend's 1e-7 tolerance on cents. Strings are rejected.
- Dates are real Gregorian `YYYY-MM-DD` dates, years 1900–2200 inclusive,
  matching the frontend validator, backup import parser, and calendar picker.
  Remote documents outside this range are rejected without repair or overwrite.
  Independently, chart histories are bounded to 3660 points, sampling longer
  spans while retaining both endpoints and replaying all intervening ledger actions.
  Chart padding is clamped to the supported date boundaries.
- Optional `settings` requires all three synchronized preferences:
  `firstDayOfWeek` (full English weekday), `ignoreWeekends` (boolean), and
  `defaultTimeline` (one of `src/settings.ts`'s exact `TIMELINE_PRESETS` strings).
  Missing settings means no synchronized preferences; clients may apply their
  existing defaults Monday, false, and `±6 month`. Device/session state is excluded.

## Existing local data and backups

A valid normalized version-1 Store can be saved directly, with preferences added
as `settings` when available. A version-1 backup from `serializeBackupJson` is
already the document shape. Legacy/unversioned, partially malformed, or numeric-
string exports first use the frontend's existing import/normalization and warning
confirmation flow, then submit the normalized Store. The server intentionally
rejects raw legacy or unsupported versions instead of silently losing data.

## Persistence boundary

`Database::ensure_user` resolves the unique exact `(oidc_issuer, oidc_subject)`
pair from a verified identity. `load` and `save` use that internal user ID, never a
client-supplied ownership field. The user foreign key and planner primary key
enforce one planner per existing user; deleting a user cascades to their planner.
`save(user_id, document, expected_revision)` validates before touching the database.
Revision zero inserts only if no planner exists; a positive revision updates only
if it matches the stored revision. PostgreSQL checks the predicate atomically,
including after waiting on a competing write. Failed validation, conflicts, and
failed SQL statements preserve the document, revision, and timestamp. Two saves
against the same revision cannot both succeed, including concurrent first saves.

## Authenticated HTTP contract

Both endpoints derive the user exclusively from the valid browser session cookie.
Ownership fields are not accepted. GET query parameters cannot select another user.
Responses use `Cache-Control: no-store`. With authentication unconfigured, both
endpoints return 401 `unauthenticated`.

### GET `/api/planner`

Returns 200 with the complete document and server metadata:

```json
{"document":{"version":1,"pools":[],"events":[],"next_id":1},"revision":1,"updated_at":"2026-10-09T12:00:00Z"}
```

An account without a saved planner returns 200 with
`{"document":null,"revision":0,"updated_at":null}`. Loading does not create a row.

### PUT `/api/planner`

Requires `Content-Type: application/json`, the session cookie, an exact `Origin`
matching `HIMA_PUBLIC_ORIGIN`, and `X-CSRF-Token` obtained from GET `/api/me`.
The body has exactly these two required fields:

```json
{"expected_revision":0,"document":{"version":1,"pools":[],"events":[],"next_id":1}}
```

`expected_revision` is a nonnegative signed 64-bit integer. Zero means create only;
positive values must match an existing planner. A positive revision on an empty
account and zero on an existing planner both conflict. Successful saves return
200 with the same response shape as GET, the submitted document, revision 1 for
creation or the previous revision plus one, and the new timestamp. A successful
save advances the revision even if the document is identical. The default request
body limit is 2 MiB. Clients should reload and reconcile after a conflict rather
than blindly retrying with a new revision.

### Errors

All errors use `{"error":{"code":"...","message":"..."}}`. Messages do not echo
submitted values or database details. Authentication/CSRF checks precede write
validation. No failed request changes the stored document or metadata.

| Status | Code | Meaning |
| --- | --- | --- |
| 401 | `unauthenticated` | Missing, invalid, revoked, or expired session; authentication unconfigured. |
| 403 | `csrf_failed` | PUT Origin or CSRF header missing or mismatched. |
| 400 | `invalid_request` | Malformed JSON. |
| 415 | `invalid_request` | Missing or unsupported JSON content type. |
| 413 | `invalid_request` | Body exceeds the request limit. |
| 422 | `invalid_request` | Wrong envelope types, missing fields, unknown fields, or noninteger/out-of-range revision. |
| 422 | `invalid_document` | Negative expected revision or document fails the validation above. |
| 409 | `revision_conflict` | Expected revision does not match current existence/revision. |
| 503 | `planner_unavailable` | Planner database operation failed. |
| 503 | `auth_unavailable` | Session database operation failed. |
