BEGIN;

CREATE TABLE IF NOT EXISTS runs (
    id text PRIMARY KEY,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    idempotency_key text NOT NULL,
    request_hash text NOT NULL,
    request_payload jsonb NOT NULL,

    status text NOT NULL DEFAULT 'queued',

    error_code text NULL,
    error_retryable boolean NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),
    completed_at timestamptz NULL,

    CONSTRAINT runs_status_check
        CHECK (
            status IN (
                'queued',
                'running',
                'awaiting_observation',
                'needs_input',
                'completed',
                'failed'
            )
        ),

    CONSTRAINT runs_workspace_idempotency_unique
        UNIQUE (
            workspace_id,
            idempotency_key
        )
);

CREATE INDEX IF NOT EXISTS
    runs_workspace_created_idx
ON runs(
    workspace_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS
    runs_status_idx
ON runs(
    status,
    updated_at
);


CREATE TABLE IF NOT EXISTS operations (
    id text PRIMARY KEY,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    sequence integer NOT NULL,

    kind text NOT NULL DEFAULT 'cognitive_decision',

    status text NOT NULL DEFAULT 'queued',

    attempt_count integer NOT NULL DEFAULT 0,
    max_attempts integer NOT NULL DEFAULT 3,

    available_at timestamptz NOT NULL DEFAULT now(),

    lease_owner text NULL,
    lease_expires_at timestamptz NULL,

    last_error_code text NULL,
    last_error_retryable boolean NULL,

    created_at timestamptz NOT NULL DEFAULT now(),
    updated_at timestamptz NOT NULL DEFAULT now(),

    started_at timestamptz NULL,
    completed_at timestamptz NULL,

    CONSTRAINT operations_sequence_positive
        CHECK (
            sequence > 0
        ),

    CONSTRAINT operations_attempts_valid
        CHECK (
            attempt_count >= 0
            AND max_attempts BETWEEN 1 AND 10
            AND attempt_count <= max_attempts
        ),

    CONSTRAINT operations_status_check
        CHECK (
            status IN (
                'queued',
                'running',
                'completed',
                'failed'
            )
        ),

    CONSTRAINT operations_run_sequence_unique
        UNIQUE (
            run_id,
            sequence
        )
);

CREATE INDEX IF NOT EXISTS
    operations_dispatch_idx
ON operations(
    status,
    available_at,
    created_at
);


CREATE TABLE IF NOT EXISTS decisions (
    id text PRIMARY KEY,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    sequence integer NOT NULL,

    decision_json jsonb NOT NULL,

    provider_name text NOT NULL,
    model text NOT NULL,
    reasoning_effort text NOT NULL,

    provider_response_id text NULL,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT decisions_sequence_positive
        CHECK (
            sequence > 0
        ),

    CONSTRAINT decisions_reasoning_effort
        CHECK (
            reasoning_effort IN (
                'low',
                'medium',
                'high'
            )
        ),

    CONSTRAINT decisions_run_sequence_unique
        UNIQUE (
            run_id,
            sequence
        )
);

CREATE INDEX IF NOT EXISTS
    decisions_workspace_run_idx
ON decisions(
    workspace_id,
    run_id
);


CREATE TABLE IF NOT EXISTS observations (
    id text PRIMARY KEY,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    sequence integer NOT NULL,

    observation_json jsonb NOT NULL,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT observations_sequence_positive
        CHECK (
            sequence > 0
        ),

    CONSTRAINT observations_run_sequence_unique
        UNIQUE (
            run_id,
            sequence
        )
);


CREATE TABLE IF NOT EXISTS usage_events (
    id text PRIMARY KEY,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    decision_id text NOT NULL
        REFERENCES decisions(id)
        ON DELETE CASCADE,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    phase text NOT NULL,

    input_tokens bigint NOT NULL DEFAULT 0,
    cached_input_tokens bigint NOT NULL DEFAULT 0,
    output_tokens bigint NOT NULL DEFAULT 0,
    reasoning_tokens bigint NOT NULL DEFAULT 0,
    total_tokens bigint NOT NULL DEFAULT 0,

    created_at timestamptz NOT NULL DEFAULT now(),

    CONSTRAINT usage_events_phase
        CHECK (
            phase IN (
                'router',
                'decision'
            )
        ),

    CONSTRAINT usage_events_nonnegative
        CHECK (
            input_tokens >= 0
            AND cached_input_tokens >= 0
            AND output_tokens >= 0
            AND reasoning_tokens >= 0
            AND total_tokens >= 0
        ),

    CONSTRAINT usage_events_decision_phase_unique
        UNIQUE (
            decision_id,
            phase
        )
);

CREATE INDEX IF NOT EXISTS
    usage_events_workspace_created_idx
ON usage_events(
    workspace_id,
    created_at DESC
);

COMMIT;
