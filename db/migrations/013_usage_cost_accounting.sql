BEGIN;

CREATE TABLE operation_failure_events (
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

    attempt_number integer NOT NULL,

    error_code text NOT NULL,
    retryable boolean NOT NULL,
    will_retry boolean NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT operation_failure_attempt_positive
        CHECK (attempt_number > 0),

    CONSTRAINT operation_failure_unique_attempt
        UNIQUE (
            operation_id,
            attempt_number
        )
);

CREATE INDEX
    operation_failure_workspace_created_idx
ON operation_failure_events (
    workspace_id,
    created_at DESC
);

CREATE INDEX
    operation_failure_run_created_idx
ON operation_failure_events (
    run_id,
    created_at
);


CREATE TABLE run_accounting_snapshots (
    run_id text PRIMARY KEY
        REFERENCES runs(id)
        ON DELETE CASCADE,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    benchmark_id text NULL,
    scenario_id text NULL,

    context_size text NULL,
    repetition integer NULL,

    provider_cost_usd numeric(20,10) NULL,
    memory_provider_cost_usd numeric(20,10) NULL,
    evaluator_provider_cost_usd numeric(20,10) NULL,

    runtime_cost_usd numeric(20,10) NULL,
    database_cost_usd numeric(20,10) NULL,
    storage_cost_usd numeric(20,10) NULL,

    total_cost_usd numeric(20,10) NULL,

    resource_at numeric(20,6) NULL,
    billable_at numeric(20,6) NULL,

    pricing_version text NULL,
    at_formula_version text NULL,

    cost_complete boolean NOT NULL
        DEFAULT false,

    objective_success boolean NULL,
    platform_failure boolean NOT NULL
        DEFAULT false,

    decision_count integer NOT NULL
        DEFAULT 0,

    observation_count integer NOT NULL
        DEFAULT 0,

    retry_count integer NOT NULL
        DEFAULT 0,

    failure_count integer NOT NULL
        DEFAULT 0,

    updated_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT run_accounting_context_size
        CHECK (
            context_size IS NULL
            OR context_size IN (
                'small',
                'medium',
                'large'
            )
        ),

    CONSTRAINT run_accounting_repetition
        CHECK (
            repetition IS NULL
            OR repetition > 0
        ),

    CONSTRAINT run_accounting_counts_nonnegative
        CHECK (
            decision_count >= 0
            AND observation_count >= 0
            AND retry_count >= 0
            AND failure_count >= 0
        ),

    CONSTRAINT run_accounting_costs_nonnegative
        CHECK (
            (
                provider_cost_usd IS NULL
                OR provider_cost_usd >= 0
            )
            AND (
                memory_provider_cost_usd IS NULL
                OR memory_provider_cost_usd >= 0
            )
            AND (
                evaluator_provider_cost_usd IS NULL
                OR evaluator_provider_cost_usd >= 0
            )
            AND (
                runtime_cost_usd IS NULL
                OR runtime_cost_usd >= 0
            )
            AND (
                database_cost_usd IS NULL
                OR database_cost_usd >= 0
            )
            AND (
                storage_cost_usd IS NULL
                OR storage_cost_usd >= 0
            )
            AND (
                total_cost_usd IS NULL
                OR total_cost_usd >= 0
            )
        ),

    CONSTRAINT run_accounting_at_nonnegative
        CHECK (
            (
                resource_at IS NULL
                OR resource_at >= 0
            )
            AND (
                billable_at IS NULL
                OR billable_at >= 0
            )
        )
);

CREATE INDEX
    run_accounting_workspace_updated_idx
ON run_accounting_snapshots (
    workspace_id,
    updated_at DESC
);

CREATE INDEX
    run_accounting_benchmark_idx
ON run_accounting_snapshots (
    benchmark_id,
    scenario_id,
    context_size,
    repetition
);

GRANT SELECT, INSERT
ON TABLE operation_failure_events
TO kiyt_app;

GRANT SELECT, INSERT, UPDATE
ON TABLE run_accounting_snapshots
TO kiyt_app;

COMMIT;
