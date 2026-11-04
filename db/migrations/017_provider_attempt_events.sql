BEGIN;

CREATE TABLE provider_attempt_events (
    id text PRIMARY KEY,

    operation_id text NOT NULL
        REFERENCES operations(id)
        ON DELETE CASCADE,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    operation_attempt_number integer NOT NULL,
    provider_call_ordinal integer NOT NULL,

    phase text NOT NULL,
    provider_name text NOT NULL,
    model text NOT NULL,

    outcome text NOT NULL,
    provider_error_code text NULL,
    http_status integer NULL,
    provider_response_id text NULL,

    usage_known boolean NOT NULL,

    input_tokens bigint NULL,
    cached_input_tokens bigint NULL,
    output_tokens bigint NULL,
    reasoning_tokens bigint NULL,
    total_tokens bigint NULL,

    provider_cost_usd numeric(20,10) NULL,
    cost_known boolean NOT NULL
        DEFAULT false,

    customer_billable boolean NOT NULL
        DEFAULT false,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT provider_attempt_operation_attempt_positive
        CHECK (
            operation_attempt_number > 0
        ),

    CONSTRAINT provider_attempt_call_ordinal_positive
        CHECK (
            provider_call_ordinal > 0
        ),

    CONSTRAINT provider_attempt_http_status_valid
        CHECK (
            http_status IS NULL
            OR (
                http_status >= 100
                AND http_status <= 599
            )
        ),

    CONSTRAINT provider_attempt_tokens_nonnegative
        CHECK (
            (
                input_tokens IS NULL
                OR input_tokens >= 0
            )
            AND (
                cached_input_tokens IS NULL
                OR cached_input_tokens >= 0
            )
            AND (
                output_tokens IS NULL
                OR output_tokens >= 0
            )
            AND (
                reasoning_tokens IS NULL
                OR reasoning_tokens >= 0
            )
            AND (
                total_tokens IS NULL
                OR total_tokens >= 0
            )
        ),

    CONSTRAINT provider_attempt_cost_nonnegative
        CHECK (
            provider_cost_usd IS NULL
            OR provider_cost_usd >= 0
        ),

    CONSTRAINT provider_attempt_unique_call
        UNIQUE (
            operation_id,
            operation_attempt_number,
            provider_call_ordinal
        )
);

CREATE INDEX
    provider_attempt_run_created_idx
ON provider_attempt_events (
    run_id,
    created_at
);

CREATE INDEX
    provider_attempt_workspace_created_idx
ON provider_attempt_events (
    workspace_id,
    created_at DESC
);

GRANT SELECT, INSERT, UPDATE
ON TABLE provider_attempt_events
TO kiyt_app;

COMMIT;
