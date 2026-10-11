-- Preserve session identity, expiration and activity. CSRF is now derived from
-- the raw browser cookie, which cannot be recovered from token_hash.
ALTER TABLE sessions DROP COLUMN csrf_token;
