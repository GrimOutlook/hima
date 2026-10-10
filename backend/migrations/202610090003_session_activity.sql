-- Existing sessions begin their idle window at migration time.
ALTER TABLE sessions ADD COLUMN last_seen_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp();
CREATE INDEX session_activity ON sessions (last_seen_at);
CREATE INDEX session_account ON sessions (user_id);
