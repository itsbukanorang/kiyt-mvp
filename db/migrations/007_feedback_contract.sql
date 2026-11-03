BEGIN;

CREATE TABLE feedback_events (
    id text PRIMARY KEY,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    decision_id text NULL
        REFERENCES decisions(id)
        ON DELETE SET NULL,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    rating smallint NOT NULL,

    comment text NULL,

    idempotency_key text NOT NULL,
    request_hash text NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT feedback_events_rating_check
        CHECK (
            rating IN (-1, 0, 1)
        ),

    CONSTRAINT feedback_events_comment_length_check
        CHECK (
            comment IS NULL
            OR char_length(comment) <= 5000
        ),

    CONSTRAINT feedback_events_idempotency_unique
        UNIQUE (
            workspace_id,
            run_id,
            idempotency_key
        )
);

CREATE INDEX feedback_events_workspace_created_idx
ON feedback_events (
    workspace_id,
    created_at DESC
);

CREATE INDEX feedback_events_run_created_idx
ON feedback_events (
    run_id,
    created_at DESC
);

CREATE INDEX feedback_events_decision_idx
ON feedback_events (
    decision_id
)
WHERE decision_id IS NOT NULL;

GRANT SELECT, INSERT
ON TABLE public.feedback_events
TO kiyt_app;

COMMIT;
