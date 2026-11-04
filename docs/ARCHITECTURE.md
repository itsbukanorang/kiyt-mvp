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
| Next.js console | Member UI, account/session flows, workspace and API-key management, and public developer documentation |
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

POST /api/v1/runs/{id}/inputs
  -> continue the same durable run when KIYT requests customer input

POST /api/v1/runs/{id}/feedback
  -> record customer feedback for the active run/decision
```

## Public Developer Documentation

Module 10 is production complete.

- Public documentation is served from `https://console.kiyt.io/docs`.
- The documentation surface contains 17 routes covering quickstart,
  authentication, core concepts, integration guides, API reference, errors
  and billing.
- OpenAPI 3.1 is published for the public cognitive API.
- Examples are provided for cURL, Python, Rust and TypeScript.
- Downloadable end-to-end quickstarts are available for all four languages.
- The documentation `Run test` sandbox is deterministic and browser-local:
  it requires no API key, does not call the KIYT API or a model, and consumes
  0 Activity Tokens.

The local documentation sandbox is a learning fixture, not evidence of a live
cognitive API call. Live integration examples remain explicitly separated and
use `KIYT_API_KEY`.

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

Current repository baseline: `main@6f6c37245f0aeb39295cf4431a2c0c067bf4c5b7`.

Next execution milestone: Module 11 — final release verification. Module 12 global learning remains an extended post-release milestone.

Module 11 must also verify that the public run-retrieval response exposes only customer-safe fields. The current source audit identified internal `provider` and `evaluation` metadata in the shared run serializer; those fields must be removed from the public response boundary without breaking internal reporting paths.
