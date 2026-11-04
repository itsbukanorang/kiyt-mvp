BEGIN;

CREATE TABLE policy_evidence_events (
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

    reward_event_id text NOT NULL
        REFERENCES reward_events(id)
        ON DELETE CASCADE,

    ledger_name text NOT NULL,
    ledger_version text NOT NULL,

    evidence_class text NOT NULL,

    reward_eligible boolean NOT NULL,
    reward double precision NULL,

    reward_hash text NOT NULL,
    run_request_hash text NOT NULL,

    reasoning_effort text NOT NULL,

    policy_evidence_hash text NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT policy_evidence_reward_check
        CHECK (
            reward IS NULL
            OR (
                reward >= -1.0
                AND reward <= 1.0
            )
        ),

    CONSTRAINT policy_evidence_eligibility_check
        CHECK (
            (
                reward_eligible = true
                AND reward IS NOT NULL
            )
            OR
            (
                reward_eligible = false
                AND reward IS NULL
            )
        ),

    CONSTRAINT policy_evidence_reward_hash_check
        CHECK (
            reward_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT policy_evidence_request_hash_check
        CHECK (
            run_request_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT policy_evidence_hash_check
        CHECK (
            policy_evidence_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT policy_evidence_reasoning_effort
        CHECK (
            reasoning_effort IN (
                'low',
                'medium',
                'high'
            )
        ),

    CONSTRAINT policy_evidence_unique_reward
        UNIQUE (
            reward_event_id,
            ledger_name,
            ledger_version
        )
);

CREATE INDEX
    policy_evidence_workspace_created_idx
ON policy_evidence_events (
    workspace_id,
    created_at DESC
);

CREATE INDEX
    policy_evidence_run_created_idx
ON policy_evidence_events (
    run_id,
    created_at DESC
);

CREATE INDEX
    policy_evidence_decision_idx
ON policy_evidence_events (
    decision_id,
    created_at DESC
);

GRANT SELECT, INSERT
ON TABLE public.policy_evidence_events
TO kiyt_app;

COMMIT;
