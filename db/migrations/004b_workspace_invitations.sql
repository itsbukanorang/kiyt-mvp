BEGIN;

CREATE TABLE IF NOT EXISTS workspace_invitations (
    id text PRIMARY KEY,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    email text NOT NULL,

    role text NOT NULL,

    token_hash text NOT NULL UNIQUE,

    created_by_user_id text NOT NULL
        REFERENCES "user"(id)
        ON DELETE RESTRICT,

    accepted_by_user_id text NULL
        REFERENCES "user"(id)
        ON DELETE SET NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    expires_at timestamptz NOT NULL,

    used_at timestamptz NULL,

    revoked_at timestamptz NULL,

    CONSTRAINT workspace_invitation_role
        CHECK (
            role IN ('admin', 'member')
        )
);

CREATE INDEX IF NOT EXISTS
    workspace_invitations_workspace_idx
ON workspace_invitations(
    workspace_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS
    workspace_invitations_email_idx
ON workspace_invitations(
    lower(email)
);

COMMIT;
