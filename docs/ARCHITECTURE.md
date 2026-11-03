# KIYT Architecture

## Product Boundary

KIYT is a cognitive service, not an agent-hosting platform.

A customer sends an objective, context, and optional `available_actions`. KIYT reasons about the request and returns a structured decision. Customer applications remain responsible for executing their own actions and for sending observations back.

```text
objective + context + available_actions
                |
                v
         KIYT reasoning
                |
                v
       structured decision
                |
                v
      customer executes action
                |
                v
          observation
                |
                +----> KIYT evaluates and decides again
```

## Runtime Responsibilities

| Component | Responsibility |
|---|---|
| Next.js console | Member UI, account/session flows, workspace and API-key management |
| Rust Axum/Tokio gateway | Public API, API-key authentication, tenant resolution, admission, durable lifecycle and idempotency |
| Python FastAPI runtime | Private cognition, planning, memory integration, evaluation and model calls |
| PostgreSQL | Identity, workspace data, API keys, durable operations, run state, usage and policy events |
| Qdrant | Working, episodic and semantic cognitive memory |

## Trust Boundary

```text
Internet
   |
   v
Rust public API
   |
   +---- authenticated workspace identity
   |
   v
Private cognitive runtime
   |
   +---- PostgreSQL
   +---- Qdrant
   +---- model providers
```

The API key is the tenant boundary for external clients. A workspace identifier supplied in a body, header, URL, or client state is never accepted as proof of authorization.

## Workspace Model

- One user can own or join multiple workspaces.
- MVP roles are `owner`, `admin`, and `member`.
- API keys are bound to exactly one workspace.
- Runs, memory, usage, evaluation, rewards, and policy state are workspace-scoped.
- Invite and API-key secrets are stored as hashes; raw values are shown only when required by the product flow.

## Cognitive Flow

The public cognitive API is designed around asynchronous runs:

```text
POST /api/v1/runs
  -> HTTP 202
  -> durable operation

GET /api/v1/runs/{id}
  -> progress
  -> decision

customer executes selected action

POST /api/v1/runs/{id}/observations
  -> HTTP 202
  -> evaluation / next decision
```

## Three-Memory Runtime

Module 06 is production complete.

- Working memory stores compact workspace/run state: objective, plan and latest observation.
- Episodic memory stores decisions together with customer-observed success/failure outcomes.
- Semantic memory stores durable knowledge with trust levels `candidate < customer_provided < verified`.
- Model-derived semantic knowledge remains candidate until explicitly verified.
- Mem0 OSS assists semantic extraction/update/deduplication using shared private Qdrant.
- Semantic embeddings use `sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2`, 384 dimensions, Cosine distance.
- Recalled memory is untrusted evidence and cannot override authorization, current objectives or customer-provided available actions.
- PostgreSQL remains the durable operational ledger; Qdrant stores cognitive memory.
- Public observation flow validates decision ownership, observation identity and idempotency.

Production Module 06 acceptance: Working 20/20, Episodic 20/20, Semantic 20/20 — total 60/60 PASS.

Current production baseline: `main@6398baee494098671b738ae3e24fbada461a2348`.

Next execution milestone: Module 08 — Playground integration. Execution order afterward remains `07 → 09 → 10 → 11`.
