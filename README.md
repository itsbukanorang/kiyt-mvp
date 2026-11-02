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
