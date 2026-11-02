# KIYT MVP - Build Status

Source of truth:
- `MVP_BUILD_PLAN.md`
- `ARCHITECTURE_RUST_PYTHON.md`

## Vertical Roadmap

```text
FOUNDATION
[00] VPS Audit                         PASS
[01] Console + Rust/Python Runtime    PASS
[02] PostgreSQL + Qdrant              PASS

MEMBER / TENANT
[03] Better Auth                      NEXT
[04] Workspace + API Key             NOT_STARTED

COGNITIVE CORE
[05] First Cognitive Decision         NOT_STARTED
[06] Three Memories                   NOT_STARTED
[07] Observation Loop                 NOT_STARTED

PRODUCT
[08] Playground                       NOT_STARTED
[09] Runs + Usage                     NOT_STARTED
[10] API Documentation                NOT_STARTED

RELEASE
[11] Release Verification             NOT_STARTED
```

## Vertical Build Rule

```text
Signup
  -> Login
  -> Private Workspace
  -> API Key
  -> Objective
  -> Rust Admission / Lifecycle
  -> Python Cognitive Runtime
  -> Meta Muse Spark 1.3 Standard
  -> Decision
  -> Customer Action
  -> Observation
  -> Evaluation / Next Decision
  -> Memory + Run History
```

The MVP must continue vertically. Do not switch to a horizontal
"build all backend first" approach.

---

## Module 0 - VPS Audit

Status: `PASS`

Verified:
- Dedicated Linux user: `kiyt-mvp`
- Repository: `itsbukanorang/kiyt-mvp`
- Branch: `main`
- GitHub SSH deploy key verified
- Existing `kiyt.io` remains operational
- Existing FLWME services remain operational
- KIYT has isolated runtime, ports, repository, and datastore boundaries

---

## Module 1 - Console + Rust/Python Foundation

Status: `PASS`

Verified:
- `https://console.kiyt.io` is live over HTTPS
- `/`, `/login`, `/signup`, `/myaccount`, `/docs` return successfully
- Public `/api/v1/*` routes through Rust Axum/Tokio
- Rust calls the private Python FastAPI runtime
- Python requires internal service authentication and rejects missing token with HTTP 401
- Only the KIYT edge is host-bound at `127.0.0.1:18180`
- Next.js, Rust, and Python have no direct public host ports
- Rust Docker build is reproducible
- Cargo workflow uses `deploy/rust-cargo.sh`
- Temporary backoffice remains outside Git at `/home/kiyt-mvp/private/backoffice-temp`

Active flow:

```text
Cloudflare
  -> Apache console.kiyt.io
  -> 127.0.0.1:18180 KIYT Edge
       -> pages -> Next.js
       -> /api/v1/* -> Rust
                         -> authenticated private Python
```

---

## Module 2 - PostgreSQL + Qdrant

Status: `PASS`

### PostgreSQL

- Image: `postgres:17.11-bookworm`
- Database: `kiyt`
- Application role: `kiyt_app`
- `kiyt_app` is not SUPERUSER, CREATEDB, or CREATEROLE
- Application write access verified
- Persistence verified across container restart
- Named volume: `kiyt-mvp-postgres-data`
- No public host port
- Bootstrap: `deploy/postgres/00-bootstrap.sh`

### Qdrant

- Image: `qdrant/qdrant:v1.20.0`
- API-key authentication enforced
- Missing API key returns HTTP 401
- Python runtime reaches Qdrant over private Docker networking
- Vector/payload persistence verified across restart
- Named volume: `kiyt-mvp-qdrant-data`
- No public host port
- Verification collection removed after test

### Server-side secrets

Stored outside Git:
- `/home/kiyt-mvp/private/runtime.env`
- `/home/kiyt-mvp/private/postgres.env`
- `/home/kiyt-mvp/private/qdrant.env`

KIYT does not reuse FLWME PostgreSQL or Qdrant resources.

---

## Current Position

```text
Module 0  PASS
Module 1  PASS
Module 2  PASS
Module 3  NEXT
```

## Module 3 - Better Auth

Status: `NEXT`

Target vertical path:

```text
/signup
  -> Better Auth
  -> KIYT PostgreSQL
  -> Real User + Session
  -> Login
  -> Protected /myaccount
  -> Logout
  -> Session Invalidated
```

Acceptance:
- Real signup works
- Real login works
- Real logout works
- Session is persisted in KIYT PostgreSQL
- `/myaccount` is blocked without a valid session
- `/myaccount` works with a valid session
- No fake users or hardcoded sessions
- Existing runtime/datastore isolation remains intact

After Module 3 passes: `Module 4 - Workspace + API Key`
