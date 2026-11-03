# KIYT MVP

KIYT MVP vertical build.

Architecture:

- `apps/console` — Next.js member console
- `services/gateway` — Rust Axum/Tokio public API runtime
- `services/runtime` — private Python FastAPI cognitive engine
- `deploy` — private edge/runtime deployment configuration
- `db/migrations` — PostgreSQL migrations
- `docs` — API and operational documentation

`console.kiyt.io/mvp/backoffice-temp` is intentionally maintained outside
this Git repository.

<!-- KIYT_STATUS_START -->

## Current Build Status

| Module | Status |
|---|---|
| 00 VPS Audit | PASS |
| 01 Console + Rust/Python Runtime | PASS |
| 02 PostgreSQL + Qdrant | PASS |
| 03 Better Auth | PASS |
| 04 Workspace + Members + API Key | PASS |
| 05 First Cognitive Decision | NOT_STARTED |
| 06 Three Memories | NOT_STARTED |
| 07 Observation Loop | NOT_STARTED |
| 08 Playground Integration | NOT_STARTED |
| 09 Runs + Usage + Billing | NOT_STARTED |
| 10 API Documentation | NOT_STARTED |
| 11 Release Verification | NOT_STARTED |

Module 04:
- Multi-workspace: PASS
- Members / invites / roles: PASS
- API Key Console: PASS
- Rust Bearer API Auth: PASS

Next: `05 - First Cognitive Decision`

<!-- KIYT_STATUS_END -->
