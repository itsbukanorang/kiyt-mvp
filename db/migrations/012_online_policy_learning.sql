BEGIN;


CREATE TABLE policy_selections (
    id text PRIMARY KEY,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    decision_id text NOT NULL
        REFERENCES decisions(id)
        ON DELETE CASCADE,

    operation_sequence integer NOT NULL,

    policy_name text NOT NULL,
    policy_version text NOT NULL,

    learner_name text NOT NULL,
    learner_version text NOT NULL,

    strategy text NOT NULL,
    mode text NOT NULL,

    context_vector_json jsonb NOT NULL,
    expectations_json jsonb NOT NULL,

    snapshot_revision bigint NOT NULL,
    history_count bigint NOT NULL,

    selection_hash text NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT policy_selections_strategy_check
        CHECK (
            strategy IN (
                'direct',
                'retrieve_first',
                'decompose_verify',
                'cautious_verify'
            )
        ),

    CONSTRAINT policy_selections_mode_check
        CHECK (
            mode IN (
                'cold_start',
                'linucb'
            )
        ),

    CONSTRAINT policy_selections_context_check
        CHECK (
            jsonb_typeof(
                context_vector_json
            ) = 'array'
            AND jsonb_array_length(
                context_vector_json
            ) = 8
        ),

    CONSTRAINT policy_selections_expectations_check
        CHECK (
            jsonb_typeof(
                expectations_json
            ) = 'object'
        ),

    CONSTRAINT policy_selections_revision_check
        CHECK (
            snapshot_revision >= 0
            AND history_count >= 0
        ),

    CONSTRAINT policy_selections_hash_check
        CHECK (
            selection_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT policy_selections_unique_decision
        UNIQUE (
            decision_id,
            policy_name,
            policy_version
        )
);


CREATE INDEX
    policy_selections_workspace_created_idx
ON policy_selections (
    workspace_id,
    created_at DESC
);


CREATE INDEX
    policy_selections_run_idx
ON policy_selections (
    run_id,
    operation_sequence
);


CREATE TABLE policy_learning_events (
    id text PRIMARY KEY,

    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    run_id text NOT NULL
        REFERENCES runs(id)
        ON DELETE CASCADE,

    decision_id text NOT NULL
        REFERENCES decisions(id)
        ON DELETE CASCADE,

    policy_evidence_event_id text NOT NULL
        REFERENCES policy_evidence_events(id)
        ON DELETE CASCADE,

    policy_selection_id text NOT NULL
        REFERENCES policy_selections(id)
        ON DELETE CASCADE,

    policy_name text NOT NULL,
    policy_version text NOT NULL,

    learner_name text NOT NULL,
    learner_version text NOT NULL,

    strategy text NOT NULL,

    context_vector_json jsonb NOT NULL,

    applied boolean NOT NULL,

    reward double precision NULL,

    reason_code text NOT NULL,

    update_hash text NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT policy_learning_strategy_check
        CHECK (
            strategy IN (
                'direct',
                'retrieve_first',
                'decompose_verify',
                'cautious_verify'
            )
        ),

    CONSTRAINT policy_learning_context_check
        CHECK (
            jsonb_typeof(
                context_vector_json
            ) = 'array'
            AND jsonb_array_length(
                context_vector_json
            ) = 8
        ),

    CONSTRAINT policy_learning_reward_check
        CHECK (
            reward IS NULL
            OR (
                reward >= -1.0
                AND reward <= 1.0
            )
        ),

    CONSTRAINT policy_learning_applied_check
        CHECK (
            (
                applied = true
                AND reward IS NOT NULL
            )
            OR
            (
                applied = false
                AND reward IS NULL
            )
        ),

    CONSTRAINT policy_learning_hash_check
        CHECK (
            update_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT policy_learning_unique_evidence
        UNIQUE (
            policy_evidence_event_id,
            policy_name,
            policy_version
        ),

    CONSTRAINT policy_learning_unique_selection
        UNIQUE (
            policy_selection_id,
            policy_name,
            policy_version
        )
);


CREATE INDEX
    policy_learning_workspace_created_idx
ON policy_learning_events (
    workspace_id,
    created_at
);


CREATE TABLE policy_snapshots (
    workspace_id text NOT NULL
        REFERENCES workspaces(id)
        ON DELETE CASCADE,

    policy_name text NOT NULL,
    policy_version text NOT NULL,

    learner_name text NOT NULL,
    learner_version text NOT NULL,

    revision bigint NOT NULL
        DEFAULT 0,

    update_count bigint NOT NULL
        DEFAULT 0,

    state_hash text NOT NULL,

    last_learning_event_id text NULL,

    updated_at timestamptz NOT NULL
        DEFAULT now(),

    PRIMARY KEY (
        workspace_id,
        policy_name,
        policy_version
    ),

    CONSTRAINT policy_snapshots_revision_check
        CHECK (
            revision >= 0
            AND update_count >= 0
        ),

    CONSTRAINT policy_snapshots_hash_check
        CHECK (
            state_hash
            ~ '^[0-9a-f]{64}$'
        )
);


GRANT SELECT, INSERT
ON TABLE public.policy_selections
TO kiyt_app;

GRANT SELECT, INSERT
ON TABLE public.policy_learning_events
TO kiyt_app;

GRANT SELECT, INSERT, UPDATE
ON TABLE public.policy_snapshots
TO kiyt_app;


COMMIT;
