# Meta Model API

Meta Model API is KIYT's hosted cognition provider for the current MVP.

## Production integration

- API: Responses API
- Model: `muse-spark-1.3`
- Module 05: PASS
- Public cognitive acceptance: 10/10 PASS

KIYT integrates the provider through:

`services/runtime/meta_reasoner.py`

The private Python runtime produces structured cognitive decisions,
while Rust and PostgreSQL own durable run lifecycle, idempotency,
operational state and recovery.

Customer actions remain customer-owned and are not executed by KIYT.

Raw chain-of-thought is not persisted or exposed.

Official documentation:

- https://dev.meta.ai/docs/overview
- https://dev.meta.ai/docs/protocols/responses
- https://dev.meta.ai/docs/reasoning
- https://dev.meta.ai/docs/structured-output
