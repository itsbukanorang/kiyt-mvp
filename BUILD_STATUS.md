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
| 05 First cognitive decision | NEXT | Cognitive run endpoint and real inference are next |
| 06 Three memories | NOT_STARTED | Working / episodic / semantic memory path not implemented yet |
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
