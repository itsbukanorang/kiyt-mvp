BEGIN;

ALTER TABLE workspaces
ADD COLUMN IF NOT EXISTS
    global_learning_consent boolean
    NOT NULL
    DEFAULT false;

COMMENT ON COLUMN
    workspaces.global_learning_consent
IS
    'Explicit opt-in for reviewed global KIYT learning. Default false.';


CREATE TABLE training_jobs (
    id text PRIMARY KEY,

    operator_user_id text NOT NULL,

    status text NOT NULL
        DEFAULT 'queued',

    dataset_version text NOT NULL,
    dataset_sha256 text NOT NULL,

    config_version text NOT NULL,

    base_model text NOT NULL,
    base_revision text NULL,

    external_job_ref text NULL,

    current_step integer NOT NULL
        DEFAULT 0,

    max_steps integer NOT NULL,

    metrics_jsonb jsonb NOT NULL
        DEFAULT '{}'::jsonb,

    adapter_path text NULL,
    report_path text NULL,

    estimated_cost_usd numeric(20,10) NULL,
    actual_cost_usd numeric(20,10) NULL,

    previous_active_ref text NULL,

    error_code text NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    started_at timestamptz NULL,
    completed_at timestamptz NULL,

    updated_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT training_jobs_status_check
        CHECK (
            status IN (
                'queued',
                'running',
                'evaluating',
                'completed',
                'failed'
            )
        ),

    CONSTRAINT training_jobs_dataset_hash_check
        CHECK (
            dataset_sha256
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT training_jobs_meta_model_check
        CHECK (
            base_model LIKE
            'meta-llama/%'
        ),

    CONSTRAINT training_jobs_steps_check
        CHECK (
            current_step >= 0
            AND max_steps > 0
            AND current_step <= max_steps
        ),

    CONSTRAINT training_jobs_metrics_check
        CHECK (
            jsonb_typeof(
                metrics_jsonb
            ) = 'object'
        ),

    CONSTRAINT training_jobs_cost_check
        CHECK (
            (
                estimated_cost_usd IS NULL
                OR estimated_cost_usd >= 0
            )
            AND (
                actual_cost_usd IS NULL
                OR actual_cost_usd >= 0
            )
        )
);

CREATE INDEX
    training_jobs_status_created_idx
ON training_jobs (
    status,
    created_at DESC
);

CREATE INDEX
    training_jobs_created_idx
ON training_jobs (
    created_at DESC
);

GRANT SELECT, INSERT, UPDATE
ON TABLE public.training_jobs
TO kiyt_app;

COMMIT;
