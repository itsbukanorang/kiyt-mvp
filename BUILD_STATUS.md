# KIYT MVP — Build Status

Updated: 3 November 2026 (UTC+7)

## Current Position

| Module | Status | Evidence boundary |
|---|---|---|
| 00 VPS audit | PASS | Runtime isolation and repository boundary verified |
| 01 Console + Rust/Python foundation | PASS | Live console, Rust gateway, private Python runtime |
| 02 PostgreSQL + Qdrant | PASS | Private persistent datastores |
| 03 Better Auth | PASS | Signup, login, logout, session and protected console |
| 04 Workspace + members + API key | PASS | Multi-workspace, invites/roles, API-key console and Rust Bearer auth |
| 05 First cognitive decision | PASS | Production acceptance PASS: real Muse Spark 1.3, 10/10 public decision cases, durable PostgreSQL ledger, auth negative, workspace isolation, idempotency, recovery gates and final public health verified |
| 06 Three memories | NEXT | Working / episodic / semantic memory path not implemented yet |
| 07 Evaluation + online RL | NOT_STARTED | Evaluation, reward and policy learner not implemented yet |
| 08 Playground integration | NOT_STARTED | UI exists; real cognitive API integration pending |
| 09 Runs + usage + billing | NOT_STARTED | Real run / usage data path pending |
| 10 API documentation | NOT_STARTED | External quickstart pending |
| 11 Release verification | NOT_STARTED | Depends on Modules 05–10 |

**5 of 12 modules PASS.**

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

## Active Module — 05 First Cognitive Decision

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

Module 05 is not PASS until the request reaches the real provider, the decision is durably stored, progress can be polled, and idempotency / recovery gates pass.

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
- Production-local `compose.yaml` remains intentionally ignored by Git.
- Runtime secrets remain outside Git; `/etc/kiyt/runtime.env` is not committed.

Next milestone: Module 06 — Mem0 + three memories.
