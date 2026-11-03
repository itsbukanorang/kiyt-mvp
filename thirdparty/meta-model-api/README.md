# Meta Model API — KIYT Integration

Official source of truth:

- https://dev.meta.ai/docs/overview
- https://dev.meta.ai/docs/protocols/responses
- https://dev.meta.ai/docs/reasoning
- https://dev.meta.ai/docs/structured-output
- https://dev.meta.ai/docs/prompt-caching

Provider:

- Meta Model API
- Responses API
- `muse-spark-1.3`
- server-side `MODEL_API_KEY`

## KIYT behavior

A lightweight Muse Spark request with `minimal`
reasoning dynamically selects the main reasoning effort:

- `low`
- `medium`
- `high`

Selection is based on task complexity rather than
business-domain keyword rules.

The main request uses Meta Structured Outputs and leaves
Meta's recommended sampling defaults unchanged.

KIYT uses:

- `store: false`
- `prompt_cache_retention: 24h`
- provider usage accounting
- cached-token accounting
- reasoning-token accounting

Customer actions are returned as decisions. KIYT does not
execute them.

Raw chain-of-thought is not persisted or exposed.

Transient provider failures are surfaced to the durable
Rust lifecycle instead of creating an independent retry
lifecycle inside Python.
