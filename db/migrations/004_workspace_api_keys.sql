BEGIN;

CREATE TABLE IF NOT EXISTS workspaces (
    id text PRIMARY KEY,
    name text NOT NULL,
    created_by_user_id text NOT NULL
        REFERENCES "user"(id) ON DELETE RESTRICT,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT workspaces_name_length
        CHECK (
            char_length(name) BETWEEN 1 AND 80
        )
);

CREATE TABLE IF NOT EXISTS workspace_members (
    workspace_id text NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,
    user_id text NOT NULL
        REFERENCES "user"(id) ON DELETE CASCADE,
    role text NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now(),

    PRIMARY KEY (
        workspace_id,
        user_id
    ),

    CONSTRAINT workspace_members_role
        CHECK (
            role IN (
                'owner',
                'admin',
                'member'
            )
        )
);

CREATE INDEX IF NOT EXISTS
    workspace_members_user_idx
ON workspace_members(user_id);

CREATE TABLE IF NOT EXISTS api_keys (
    id text PRIMARY KEY,

    workspace_id text NOT NULL
        REFERENCES workspaces(id) ON DELETE CASCADE,

    created_by_user_id text NOT NULL
        REFERENCES "user"(id) ON DELETE RESTRICT,

    name text NOT NULL,

    key_prefix text NOT NULL,
    key_hash text NOT NULL UNIQUE,

    created_at timestamptz NOT NULL DEFAULT now(),
    last_used_at timestamptz NULL,
    revoked_at timestamptz NULL,

    CONSTRAINT api_keys_name_length
        CHECK (
            char_length(name) BETWEEN 1 AND 80
        )
);

CREATE INDEX IF NOT EXISTS
    api_keys_workspace_idx
ON api_keys(
    workspace_id,
    created_at DESC
);

COMMIT;
