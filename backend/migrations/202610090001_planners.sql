CREATE TABLE users (
    id BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
    oidc_issuer TEXT NOT NULL CHECK (length(btrim(oidc_issuer)) > 0),
    oidc_subject TEXT NOT NULL CHECK (length(btrim(oidc_subject)) > 0),
    created_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    UNIQUE (oidc_issuer, oidc_subject)
);

CREATE TABLE planners (
    user_id BIGINT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    document JSONB NOT NULL CHECK (jsonb_typeof(document) = 'object'),
    revision BIGINT NOT NULL DEFAULT 1 CHECK (revision > 0),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp()
);
