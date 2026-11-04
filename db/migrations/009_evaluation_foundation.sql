BEGIN;

CREATE TABLE evaluation_events (
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

    feedback_event_id text NULL
        REFERENCES feedback_events(id)
        ON DELETE SET NULL,

    evaluator_name text NOT NULL,
    evaluator_version text NOT NULL,

    rubric_name text NOT NULL,
    rubric_version text NOT NULL,

    evidence_class text NOT NULL,
    evidence_hash text NOT NULL,

    score double precision NOT NULL,
    passed boolean NOT NULL,

    components_json jsonb NOT NULL,
    artifact_json jsonb NOT NULL,
    artifact_hash text NOT NULL,

    created_at timestamptz NOT NULL
        DEFAULT now(),

    CONSTRAINT evaluation_events_score_check
        CHECK (
            score >= 0.0
            AND score <= 1.0
        ),

    CONSTRAINT evaluation_events_evidence_hash_check
        CHECK (
            evidence_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT evaluation_events_artifact_hash_check
        CHECK (
            artifact_hash
            ~ '^[0-9a-f]{64}$'
        ),

    CONSTRAINT evaluation_events_components_object
        CHECK (
            jsonb_typeof(
                components_json
            ) = 'object'
        ),

    CONSTRAINT evaluation_events_artifact_object
        CHECK (
            jsonb_typeof(
                artifact_json
            ) = 'object'
        ),

    CONSTRAINT evaluation_events_unique_evaluation
        UNIQUE (
            workspace_id,
            run_id,
            decision_id,
            observation_id,
            evaluator_name,
            evaluator_version,
            rubric_version
        )
);

CREATE INDEX
    evaluation_events_workspace_created_idx
ON evaluation_events (
    workspace_id,
    created_at DESC
);

CREATE INDEX
    evaluation_events_run_created_idx
ON evaluation_events (
    run_id,
    created_at DESC
);

CREATE INDEX
    evaluation_events_decision_created_idx
ON evaluation_events (
    decision_id,
    created_at DESC
);

CREATE INDEX
    evaluation_events_observation_created_idx
ON evaluation_events (
    observation_id,
    created_at DESC
);

GRANT SELECT, INSERT
ON TABLE public.evaluation_events
TO kiyt_app;

COMMIT;
