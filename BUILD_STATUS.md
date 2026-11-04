# KIYT MVP — Build Status

Updated: 5 November 2026 (UTC+7)

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
| 09 Runs + usage + billing | PASS | Real run history, usage accounting, Activity Tokens, customer billing views, provider-attempt ledger and production reconciliation verified |
| 10 API documentation | PASS | Public docs live; 17/17 routes, OpenAPI 3.1, cURL/Python/Rust/TypeScript examples, downloadable quickstarts and deterministic local 0-AT sandbox verified in production |
| 11 Release verification | PASS | Production release boundary, real lifecycle, idempotency, isolation, ALK/reward/LinUCB, memory, Activity Tokens, restart recovery, docs/console regression and security gates verified |
| 12 Global KIYT learning | NOT_STARTED | Permissioned, abstracted global learning pipeline with holdout evaluation and manual activation |

**Modules 00–11 PASS (12 completed milestones). The KIYT MVP service release gate is complete. Module 12 is the next extended global-learning milestone and is verified separately.**

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

- Modules 00–11: PASS.
- Module 06 — Three memories: PASS (60/60 production hard tests).
- Completed milestones: Modules 00–11 PASS (12 milestones).
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

Current project next milestone: Module 12 — Global KIYT learning.


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

Execution order after Module 11: `12`.

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

Current next milestone: Module 10 — API documentation.

## Module 09 production completion

Module 09 completed production acceptance on 4 November 2026 (UTC+7).

- Customer console Overview, Runs and Billing use real persisted run and usage data.
- Customer-facing usage is expressed as Activity Tokens (AT); display is fixed to two decimal places.
- Public customer pricing is `$5 / 1,000 AT`.
- Internal Activity Token calculation and private billing implementation remain server-only and are intentionally excluded from the public repository.
- Runs list exposes customer-safe run status, decision/observation state and real AT usage without provider/model economics.
- Run detail exposes customer-safe lifecycle, decision history, observations, durable operations and AT usage.
- Provider/model names, raw provider-token economics and internal supplier cost are not exposed in the customer billing UI.
- Migration `013_usage_cost_accounting.sql`: production applied.
- Module 09 immutable benchmark: `m09_270_20261104T031838Z`.
- Benchmark scope: 30 scenarios × 3 context sizes × 3 repetitions = 270 real runs.
- Benchmark baseline preserved at 270 accounting snapshot rows.
- Cross-workspace leakage: 0.
- Duplicate billing: 0.
- Duplicate learning: 0.
- Unknown provider cost is not guessed or falsely billed.
- Provider-attempt ledger migration `017_provider_attempt_events.sql`: production applied.
- Provider-attempt runtime/gateway candidate deployed and production health verified.
- Final real provider-ledger validation run: completed.
- Final operation attempt count: 1 of max 3; no retry required.
- Provider attempts persisted: 2 — one router attempt and one decision attempt.
- Router attempt: success, HTTP 200, provider usage known.
- Decision attempt: success, HTTP 200, provider usage known.
- Provider-attempt ledger ↔ `usage_events` reconciliation: PASS.
- Failed provider attempts billed to customer: 0.
- Duplicate provider-attempt groups: 0.
- Provider-ledger tenant mismatch: 0.
- Guessed provider cost rows: 0.
- Temporary validation API keys remaining: 0.
- Final Module 09 database assertion: `PASS`.
- Private billing migrations/views containing internal pricing logic remain outside Git.
- Production secrets and deployment-only configuration remain outside Git.

## Module 10 production completion

Module 10 completed production acceptance on 4 November 2026 (UTC+7).

- Release commit: `6f6c37245f0aeb39295cf4431a2c0c067bf4c5b7`.
- Public developer documentation: `https://console.kiyt.io/docs`.
- Documentation routes: 17/17 PASS.
- OpenAPI 3.1: PASS.
- Public examples: cURL, Python, Rust and TypeScript.
- Downloadable quickstarts: `quickstart.sh`, `quickstart.py`, `quickstart.rs`, `quickstart.ts` — 4/4 PASS.
- Deterministic browser-local `Run test` sandbox: PASS.
- Sandbox requires no API key.
- Sandbox sends no network request to KIYT.
- Sandbox invokes no reasoning provider or model.
- Sandbox Activity Token usage: 0 AT.
- Targeted Module 10 ESLint: 0 errors, 2 `<img>` optimization warnings.
- Canonical Docker / Next.js 16.4.1 production build: PASS.
- Existing console login behavior remained unchanged (`307` to `/`, final destination healthy).
- Production console image: `kiyt-console:m10-docs-sandbox-v4-candidate`.
- Production image ID: `sha256:67cbf4b290545e9990d351ff6bdf7aa9bddd7638b47493408bcdf809a8c4bf9d`.
- Module 10 production rollback was not required.
- Production secrets and deployment-only configuration remain outside Git.

### Open release hardening before Module 11

A source audit during Module 10 confirmed that the current public
`GET /api/v1/runs/{run_id}` path uses a serializer that still assembles internal
`provider` and `evaluation` metadata.

The public documentation intentionally does not document these internal fields.

Before Module 11 can mark the MVP service release PASS, the public response
boundary must be hardened so provider/model/raw-usage internals and evaluation
artifacts are not exposed to customer API clients, while preserving internal
console/reporting paths that legitimately require them.

Module 10 documentation itself is PASS. This serializer cleanup is a Module 11
release-boundary requirement.

Module 11 resolved this release-boundary item. The public run serializer now
uses an explicit customer-safe decision allowlist and no longer attaches
provider metadata, provider usage, evaluation artifacts or other internal
reasoning evidence to the public run response.

## Module 11 production release verification

Module 11 completed production acceptance on 5 November 2026 (UTC+7).

Release boundary under verification:

- Parent repository HEAD before the Module 11 source change:
  `595023971ffbd53fed71773308edff7c06d35f45`.
- Verified gateway source SHA256:
  `5b31f0ee20a1b6721a79aab7576c2a021027a5d953178b3287f4086656a47b94`.
- Production candidate image:
  `kiyt-gateway:m11-public-boundary-rc1`.
- Production image ID:
  `sha256:ce75cc6de7d71ebc2739b80d9d701e57a55013b0ae4a4f7134f5030927b4c4dc`.

Release acceptance:

- Public run/decision serializer uses an explicit allowlist.
- Public decision fields are limited to `status`, `action`,
  `reason_summary`, `run_id` and `decision_id`.
- Customer-owned `action.arguments` are preserved verbatim while internal
  decision/provider metadata is stripped.
- Provider name/model/reasoning metadata, provider response IDs, raw provider
  usage and evaluation artifacts are not returned by the public run serializer.
- Public-boundary production fixture: PASS.
- Owner-workspace access: HTTP 200.
- Cross-workspace access: HTTP 404.
- Missing/invalid authentication: HTTP 401.
- Internal metadata exposure canary count: 0.
- Real lifecycle trajectory:
  `requires_action → successful observation → completed`.
- Observation create: HTTP 202.
- Observation idempotent replay: PASS.
- Same idempotency key with different observation payload: HTTP 409.
- Durable continuation singleton: PASS.
- Continuation operations: 2.
- Persisted decisions: 2.
- Usage ledger events on the acceptance trajectory: 4.
- Provider-attempt ledger events on the acceptance trajectory: 4.
- ALK evaluation:
  `future-agi-agent-learning-kit` `0.3.5`, score `0.8833`, PASS.
- Deterministic KIYT reward: `0.8833`, eligible observed success.
- Policy evidence ledger: PASS.
- MABWiser LinUCB `2.7.4` online update: applied.
- Cognitive strategy selected for the accepted reward: `direct`.
- Policy snapshot after the acceptance update:
  revision `1`, update count `1`.
- Feedback create/replay/idempotency-conflict contract: PASS.
- Gateway-only restart recovery: PASS.
- Run, API authentication, idempotency, feedback, reward and policy state
  remained durable after restart.
- Real production Working Memory read: PASS.
- Real production Episodic Memory success recall: PASS.
- Semantic Memory scoped read path: PASS.
- LangGraph positive and negative contract regression: PASS.
- Evaluation-adapter regression: PASS.
- Acceptance trajectory Activity Tokens:
  `11.8530000000000000` AT.
- Decision Activity Token accounting: PASS.
- Public documentation route: HTTP 200.
- OpenAPI 3.1 server prefix and all five core public API paths/methods: PASS.
- Playground, Runs, Billing and API Keys route resolution: PASS.
- Public serializer source unit tests: 4/4 PASS.
- Final secret/log audit:
  temporary API-key hits `0`, sensitive environment-value log hits `0`,
  Authorization header log hits `0`, hidden-reasoning marker hits `0`.
- Temporary Module 11 API credential removed after acceptance.
- Root-only temporary acceptance state removed after acceptance.
- Release run, observation, evaluation, reward, feedback and policy-learning
  evidence retained.
- Final public health: PASS.
- Module 11 required no database reset, volume reset or proxy redesign.

Historical provider failure/recovery acceptance from the already-PASS durable
runtime remains applicable because Module 11 changes only the customer-facing
run serialization boundary; provider execution/retry behavior was not modified.

Module 12 remains a separate post-MVP learning milestone and does not change
this Module 11 service-release PASS result.

## Module 12 — Global KIYT Learning

Module 12 is an extended learning milestone after the MVP service release gate. It is not required to mark Module 11 complete.

Target outcome:

- Learn only from usage that is explicitly eligible for global improvement.
- Abstract and review examples before they enter a global learning dataset.
- Exclude raw private customer memory, secrets, identifiers and proprietary content from shared learning data.
- Train and evaluate an updated global decision model offline against a held-out evaluation set.
- Activate a new global model version only after measured evaluation passes and a manual release decision is made.

Module 12 remains **NOT_STARTED** until the learning pipeline and measured evaluation are implemented and verified.
