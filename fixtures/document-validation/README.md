# Shared document-validation fixtures

`valid.json` and `invalid.json` contain named cases with complete JSON documents.
Every case in `valid.json` must be accepted, and every case in `invalid.json`
must be rejected, by both strict version-1 validators. These are remote-document
fixtures, not expectations for the repairing legacy-import normalizer.

Add cases here when changing document validation so TypeScript and Rust cannot
silently drift. Both suites read these exact files; do not maintain language-local
copies. Cases cover optional fields, collection-scoped IDs, UTF-16 name lengths,
date and hour boundaries, recurrence, caps, event allocations, and preferences.
Large collection-limit cases remain in the existing language-specific suites.

Run from the repository root:

```sh
pnpm test
cargo test --locked --manifest-path backend/Cargo.toml --test document_fixtures
```
