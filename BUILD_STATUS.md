# KIYT MVP — Build Status

Updated: 4 November 2026 (UTC+7)

## Current Position

| Module | Status | Evidence boundary |
|---|---|---|
| 00 VPS audit | PASS | Runtime isolation and repository boundary verified |
| 01 Console + Rust/Python foundation | PASS | Live console, Rust gateway, private Python runtime |
| 02 PostgreSQL + Qdrant | PASS | Private persistent datastores |
| 03 Better Auth | PASS | Signup, login, logout, session and protected console |
| 04 Workspace + members + API key | PASS | Multi-workspace, invites/roles, API-key console and Rust Bearer auth |
| 05 First cognitive decision | PASS | Production 10/10 public decision acceptance with real Muse Spark 1.3; durable PostgreSQL run/operation/decision/usage ledger; auth, isolation, idempotency and recovery verified |
| 06 Three memories | PASS | Working, episodic and semantic memory production acceptance 60/60 PASS |
| 07 Evaluation + online RL | PASS | ALK evaluation, deterministic KIYT reward mapping, immutable policy evidence, workspace-scoped MABWiser LinUCB learning and final production policy E2E verified |
| 08 Playground integration | PASS | Real Playground run creation, polling, structured decisions, observation continuation, durable `needs_input` continuation, reload resume and production browser E2E verified |
| 09 Runs + usage + billing | NOT_STARTED | Real run / usage data path pending |
| 10 API documentation | NOT_STARTED | External quickstart pending |
| 11 Release verification | NOT_STARTED | Final production release gate after Modules 05–10 |
| 12 Global KIYT learning | NOT_STARTED | Permissioned, abstracted global learning pipeline with holdout evaluation and manual activation |

**Modules 00–08 PASS (9 completed milestones). Module 09 is next. Module 12 is an extended learning milestone and does not block the MVP service release at Module 11.**

## Module 04 Evidence

Hard-tested:

- Better Auth browser session flow.
- Multi-workspace create / switch / rename.
- Owner, admin and member authorization.
- Expiring, single-use workspace invitations.
- Multiple workspace API keys.
- Raw API key displayed once; stored hash retained.
- API-key revocation.
- Cross-workspace API-key isolation.
- Rust Bearer authentication.
- Missing or malformed Bearer token returns HTTP 401.
- Valid API key resolves its workspace.
- Caller-supplied workspace override does not replace authenticated tenant identity.
- Revoked API key returns HTTP 401.
- Successful authentication updates `last_used_at`.

## Module 05 — First Cognitive Decision

Target vertical slice:

```text
POST /api/v1/runs
  -> Rust Bearer authentication
  -> workspace resolution
  -> durable run / operation in PostgreSQL
  -> bounded Rust lifecycle
  -> private Python cognition
  -> real model inference
  -> structured decision
  -> persisted result
  -> GET /api/v1/runs/{id}
```

Module 05 is PASS. Production acceptance verified the real provider path, durable decision persistence, public polling, idempotency, workspace isolation, bounded execution, recovery, usage persistence, fixture cleanup, and final public health.


## Current build position

- Modules 00–08: PASS.
- Module 06 — Three memories: PASS (60/60 production hard tests).
- Completed milestones: Modules 00–08 PASS (9 milestones).
- Pre-Module 08 API contract hardening: PASS at `main@75d75de6aff6e8a9aa67d5d8fbe780933d591339`.
- Public Module 05 acceptance: 10/10 PASS.
- Production migration 005: applied.
- Production migration 008 (`run_inputs`): applied.
- Module 08 real Playground browser E2E: PASS.
- Production runtime/gateway health: PASS.
- Production secrets and deployment-only configuration remain outside the public repository.

## Status Rule

A module is marked PASS only after its real behavior is implemented and verified. No secret, raw customer content, raw invite token, raw API key, credential, or private environment value belongs in this file.

## Module 05 production completion

Module 05 completed production acceptance on 3 November 2026 (UTC+7).

- Source commit: `192a3f2`.
- Production migration `005_durable_runs.sql`: PASS.
- Rust gateway + private Python cognitive runtime: deployed and healthy.
- Real Meta Muse Spark 1.3 decision path: PASS.
- Public decision acceptance: 10/10 PASS.
- Authentication-negative behavior: PASS.
- Cross-workspace isolation: PASS.
- Idempotent replay: PASS.
- Idempotency payload conflict: PASS.
- Durable PostgreSQL evidence: `10|10|10|20|10`.
- Bounded worker execution: PASS.
- Expired-lease recovery: PASS.
- Max-attempt exhaustion: PASS.
- Acceptance fixture cleanup: PASS.
- Final public health: PASS.
- Deployment-only configuration remains outside the public repository.
- Runtime secrets remain outside Git.

Current project next milestone: Module 09 — Runs + usage + billing.


## Module 06 production completion

Module 06 completed production acceptance on 4 November 2026 (UTC+7).

- Release commit: `6398baee494098671b738ae3e24fbada461a2348`.
- Working Memory: 20/20 PASS.
- Episodic Memory: 20/20 PASS.
- Semantic Memory: 20/20 PASS.
- Total Module 06 hard tests: 60/60 PASS.
- PostgreSQL and Qdrant remain private.
- Workspace isolation: PASS.
- Restart persistence: PASS.
- Observation contract and idempotency: PASS.
- Mem0 `infer=True` semantic extraction: PASS.
- Real Meta Muse Spark 1.3 memory influence: PASS.
- Memory injection defense: PASS.
- Production health and logs: PASS.
- Test fixtures cleaned: PASS.

Execution order after Module 07: `09 → 10 → 11 → 12`.

## Module 07 production completion

Module 07 completed production acceptance on 4 November 2026 (UTC+7).

- Release commit: `c20efa87a8adb4b64d6c68324b2602dfb053981d`.
- Future AGI Agent Learning Kit: `agent-learning-kit==0.3.5`.
- ALK evaluator license verified from the exact release source as Apache-2.0; upstream `LICENSE` and `NOTICE` retained under `thirdparty/LICENSES/`.
- MABWiser: `2.7.4`, Apache-2.0, LinUCB with `n_jobs=1`.
- Migration `009_evaluation_foundation.sql`: PASS.
- Migration `010_reward_mapping.sql`: PASS.
- Migration `011_policy_evidence_ledger.sql`: PASS.
- Migration `012_online_policy_learning.sql`: PASS.
- Real ALK hard test: 10/10 PASS across positive and negative outcomes.
- Deterministic reward mapping: PASS.
- Subjective feedback has no direct reward effect.
- Immutable policy evidence ledger: PASS.
- Four cognitive strategy arms: `direct`, `retrieve_first`, `decompose_verify`, `cautious_verify`.
- Real online policy-learning cold start: 4/4 PASS.
- LinUCB changed the next selected strategy after eligible rewards: PASS.
- Final Module 07 policy E2E: 4/4 full real evidence chain PASS.
- Exactly-once evaluation/reward/evidence/policy update: PASS.
- PostgreSQL durable policy state: PASS.
- Restart policy reconstruction: PASS.
- Workspace policy isolation: PASS.
- Tenant isolation: PASS.
- Acceptance fixtures cleaned: PASS.
- Customer actions remain customer-executed; KIYT receives execution results as observations and remains the cognitive decision layer.

## Module 08 production completion

Module 08 completed production acceptance on 4 November 2026 (UTC+7).

- Release commit: `2c3a3872db505d0b5a89c0de488b3b50dc9ef9e1`.
- Playground uses the real cognitive API; no fake decision path.
- Real run creation and durable polling: PASS.
- Structured action decision rendering: PASS.
- `requires_action` observation continuation: PASS.
- Exact `decision_id` continuation contract: PASS.
- Durable `run_inputs` persistence: PASS.
- `needs_input` continuation through `POST /api/v1/runs/{id}/inputs`: PASS.
- Input continuation resumes reasoning on the same persisted run: PASS.
- Reload resumes the workspace's persisted run: PASS.
- Console cognitive bridge remains workspace-scoped and authenticated: PASS.
- Production migration `008_run_inputs.sql`: PASS.
- Rust gateway health after deployment: PASS.
- Console production deployment: PASS.
- Public unauthenticated cognitive access remains HTTP 401.
- Browser E2E `INPUT NEEDED → Continue run → reasoning → next decision`: PASS.
- Production secrets and deployment-only configuration remain outside Git.

Current next milestone: Module 09 — Runs + usage + billing.

## Module 12 — Global KIYT Learning

Module 12 is an extended learning milestone after the MVP service release gate. It is not required to mark Module 11 complete.

Target outcome:

- Learn only from usage that is explicitly eligible for global improvement.
- Abstract and review examples before they enter a global learning dataset.
- Exclude raw private customer memory, secrets, identifiers and proprietary content from shared learning data.
- Train and evaluate an updated global decision model offline against a held-out evaluation set.
- Activate a new global model version only after measured evaluation passes and a manual release decision is made.

Module 12 remains **NOT_STARTED** until the learning pipeline and measured evaluation are implemented and verified.
