BEGIN;

CREATE TABLE run_inputs (
    id text PRIMARY KEY,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    sequence integer NOT NULL,

    decision_id text NOT NULL
        REFERENCES decisions(id)
        ON DELETE CASCADE,

    input_json jsonb NOT NULL,

    idempotency_key text NOT NULL,
    request_hash text NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT run_inputs_sequence_positive
        CHECK (
            sequence > 0
        ),

    CONSTRAINT run_inputs_json_object
        CHECK (
            jsonb_typeof(input_json)
            = 'object'
        ),

    CONSTRAINT run_inputs_run_sequence_unique
        UNIQUE (
            run_id,
            sequence
        ),

    CONSTRAINT run_inputs_workspace_idempotency_unique
        UNIQUE (
            workspace_id,
            run_id,
            idempotency_key
        )
);

CREATE INDEX run_inputs_workspace_created_idx
ON run_inputs (
    workspace_id,
    created_at DESC
);

CREATE INDEX run_inputs_decision_idx
ON run_inputs (
    decision_id
);

GRANT SELECT, INSERT
ON TABLE public.run_inputs
TO kiyt_app;

COMMIT;
