-- Local users occupy a reserved identity namespace; external accounts are never linked.
CREATE TABLE local_credentials (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    username TEXT NOT NULL UNIQUE CHECK (username ~ '^[a-z0-9][a-z0-9_.-]{2,63}$'),
    password_hash TEXT NOT NULL
);
-- One shared, bounded admission bucket across all API processes (including successes).
CREATE TABLE local_login_admission (
    id BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (id),
    window_start TIMESTAMPTZ NOT NULL,
    attempts INTEGER NOT NULL
);
