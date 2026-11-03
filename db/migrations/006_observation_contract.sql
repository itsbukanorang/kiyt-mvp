BEGIN;

ALTER TABLE observations
    ADD COLUMN IF NOT EXISTS
        decision_id text NULL
        REFERENCES decisions(id)
        ON DELETE CASCADE;

ALTER TABLE observations
    ADD COLUMN IF NOT EXISTS
        idempotency_key text NULL;

ALTER TABLE observations
    ADD COLUMN IF NOT EXISTS
        request_hash text NULL;

CREATE UNIQUE INDEX IF NOT EXISTS
    observations_run_idempotency_unique
ON observations(
    run_id,
    idempotency_key
)
WHERE idempotency_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS
    observations_workspace_created_idx
ON observations(
    workspace_id,
    created_at DESC
);

CREATE INDEX IF NOT EXISTS
    observations_decision_idx
ON observations(
    decision_id
)
WHERE decision_id IS NOT NULL;

COMMIT;
