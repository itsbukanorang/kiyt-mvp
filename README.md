# KIYT MVP

**KIYT is a hosted, model-agnostic cognitive service for reasoning, planning, and business decisions.**

Customer applications and agents call KIYT over HTTPS. KIYT authenticates the workspace, reasons over the objective and context, selects from customer-provided `available_actions`, and returns a structured decision. The customer executes the action in its own environment and sends the observation back to KIYT.

## Architecture

```text
Customer Application / Agent
            |
            | HTTPS + KIYT API Key
            v
+-----------------------------+
| Rust Gateway                |
| Axum + Tokio                |
| auth / tenant / lifecycle   |
+-------------+---------------+
              |
              v
+-----------------------------+
| Private Python Runtime      |
| cognition / planning        |
+-------------+---------------+
              |
              +----> model inference
              |
              +----> Qdrant memory

PostgreSQL
  -> identity
  -> workspace / members
  -> API keys
  -> durable run state
```

The member console uses **Next.js + Better Auth**. The public API boundary is **Rust**. The private cognitive engine is **Python**. PostgreSQL owns operational state and Qdrant is used for cognitive memory.

See [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Core Open-Source Foundations

KIYT builds its own cognitive service and product logic on top of selected
open-source foundations:

- **LangGraph** — cognitive graph execution
- **Mem0** — memory extraction and deduplication
- **FastEmbed** — local embedding runtime
- **Qdrant** — vector memory layer
- **Future AGI Agent Learning Kit (ALK)** — versioned outcome evaluation
- **MABWiser** — workspace-scoped LinUCB cognitive-strategy learning

KIYT-specific orchestration, lifecycle, tenancy, memory policy and decision
logic remain part of the KIYT implementation.

See [`thirdparty/`](thirdparty/) for attribution and license details.

## Repository

```text
apps/console/         Next.js member console
services/gateway/     Rust public API and tenant boundary
services/runtime/     Private Python cognitive runtime
db/migrations/        PostgreSQL application schema
docs/                 Product and architecture documentation
```

Production deployment configuration, host paths, credentials, private environment files, and server-only tooling are intentionally excluded from this public repository.

## Current Build Status

| Module | Status |
|---|---|
| 00 VPS foundation | PASS |
| 01 Console + Rust/Python foundation | PASS |
| 02 PostgreSQL + Qdrant | PASS |
| 03 Better Auth | PASS |
| 04 Workspace + members + API keys | PASS |
| 05 First cognitive decision | PASS |
| 06 Three memories | PASS |
| 07 Evaluation + online RL | PASS |
| 08 Playground integration | PASS |
| 09 Runs + usage + billing | PASS |
| 10 API documentation | NOT_STARTED |
| 11 Release verification | NOT_STARTED |
| 12 Global KIYT learning | NOT_STARTED |

**Current position: Modules 00–09 PASS — 10 completed milestones. Module 10 API documentation is next. Module 11 remains the MVP service release gate; Module 12 is an extended global-learning milestone.**

Module 04 includes multi-workspace tenancy, owner/admin/member roles, hashed and revocable workspace API keys, and Rust Bearer authentication with tenant resolution.

Module 06 is production complete with 60/60 hard tests passing across Working, Episodic and Semantic Memory. Semantic trust is ordered as `candidate < customer_provided < verified`, and recalled memory is treated as untrusted evidence rather than instructions.

Module 07 is production complete. Observed action results flow through Future AGI ALK evaluation, KIYT's deterministic reward mapper, an immutable policy-evidence ledger, and workspace-scoped MABWiser LinUCB learning. Production acceptance verified eligible positive/negative rewards, exactly-once policy updates, durable PostgreSQL policy state, restart reconstruction, workspace isolation, tenant isolation, and a changed next cognitive strategy after learning.

Module 08 is production complete. The Playground now creates real cognitive runs, polls durable state, renders structured decisions, reports action observations, resumes persisted runs after reload, and continues `needs_input` decisions through durable `/inputs` continuation on the same run.

Module 09 is production complete. The console now exposes real run history, customer-safe run detail, Activity Token usage and billing data. Production acceptance includes the immutable 270-run benchmark, durable provider-attempt accounting, router/decision usage reconciliation, zero duplicate billing, zero cross-workspace ledger mismatch, and no guessed provider cost. Public pricing is **$5 / 1,000 AT**; the internal Activity Token calculation remains private and is intentionally excluded from this repository.

Module 12 extends KIYT with global learning from eligible, permissioned and abstracted usage. Candidate improvements are evaluated against held-out tests and require an explicit release decision before activation. Raw private customer memory, secrets, identifiers and proprietary content are excluded from shared learning data.

Current execution priority: `10 → 11 → 12`.

## Public Cognitive API Direction

```text
POST /api/v1/runs
GET  /api/v1/runs/{id}
POST /api/v1/runs/{id}/observations
POST /api/v1/runs/{id}/inputs
POST /api/v1/runs/{id}/feedback
```

Core request concepts:

```text
objective
context
available_actions
limits
```

`available_actions` are owned and executed by the customer. KIYT selects and returns decisions; it does not execute customer tools or host customer agents.

## Security Model

- API keys are workspace-scoped and stored as hashes.
- Rust derives tenant identity from the authenticated API key.
- Workspace IDs supplied by callers are never treated as authorization.
- Python, PostgreSQL, and Qdrant are private runtime components.
- Secrets and production environment files are never committed to this repository.
