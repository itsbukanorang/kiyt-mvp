BEGIN;

CREATE TABLE reward_events (
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

    observation_id text NOT NULL
        REFERENCES observations(id)
        ON DELETE CASCADE,

    evaluation_event_id text NOT NULL
        REFERENCES evaluation_events(id)
        ON DELETE CASCADE,

    mapper_name text NOT NULL,
    mapper_version text NOT NULL,

    evidence_class text NOT NULL,

    outcome_status text NULL,

    evaluation_score double precision NOT NULL,

    eligible boolean NOT NULL,

    reward double precision NULL,

    reason_code text NOT NULL,

    source_artifact_hash text NOT NULL,
    reward_hash text NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT reward_events_evaluation_score_check
        CHECK (
            evaluation_score >= 0.0
            AND evaluation_score <= 1.0
        ),

    CONSTRAINT reward_events_reward_check
        CHECK (
            reward IS NULL
            OR (
                reward >= -1.0
                AND reward <= 1.0
            )
        ),

    CONSTRAINT reward_events_eligibility_check
        CHECK (
            (
                eligible = true
                AND reward IS NOT NULL
            )
            OR
            (
                eligible = false
                AND reward IS NULL
            )
        ),

    CONSTRAINT reward_events_outcome_status_check
        CHECK (
            outcome_status IS NULL
            OR outcome_status IN (
                'success',
                'failure'
            )
        ),

    CONSTRAINT reward_events_source_hash_check
        CHECK (
            source_artifact_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT reward_events_reward_hash_check
        CHECK (
            reward_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT reward_events_unique_mapping
        UNIQUE (
            evaluation_event_id,
            mapper_name,
            mapper_version
        )
);

CREATE INDEX reward_events_workspace_created_idx
ON reward_events (
    workspace_id,
    created_at DESC
);

CREATE INDEX reward_events_run_created_idx
ON reward_events (
    run_id,
    created_at DESC
);

CREATE INDEX reward_events_decision_created_idx
ON reward_events (
    decision_id,
    created_at DESC
);

CREATE INDEX reward_events_observation_created_idx
ON reward_events (
    observation_id,
    created_at DESC
);

GRANT SELECT, INSERT
ON TABLE public.reward_events
TO kiyt_app;

COMMIT;
