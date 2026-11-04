# KIYT — Core Open-Source Foundations

## LangGraph

- Version: `1.2.19`
- License: MIT
- Role: private cognitive graph execution
- Status: INTEGRATED
- Upstream: https://github.com/langchain-ai/langgraph
- License copy: `thirdparty/LICENSES/langgraph.LICENSE`

KIYT integrates LangGraph through its private cognitive runtime. KIYT retains
ownership of the surrounding lifecycle, tenant boundaries and product logic.

## Mem0

- Version: `2.2.1`
- Package: `mem0ai[nlp]`
- License: Apache-2.0
- Role: memory extraction, update and deduplication helper
- Status: INTEGRATED
- Upstream: https://github.com/mem0ai/mem0
- License copy: `thirdparty/LICENSES/mem0.LICENSE`

Mem0 assists KIYT's memory pipeline. KIYT remains the canonical owner of
workspace memory policy, trust handling, persistence boundaries and lifecycle.

## FastEmbed

- Version: `0.9.1`
- License: Apache-2.0
- Role: local embedding runtime for cognitive memory
- Status: INTEGRATED
- Upstream: https://github.com/qdrant/fastembed
- License copy: `thirdparty/LICENSES/fastembed.LICENSE`
- Upstream notice: `thirdparty/LICENSES/fastembed.NOTICE`

FastEmbed provides the embedding runtime used by KIYT's memory adapter.

## Qdrant Client

- Version: `1.20.0`
- License: Apache-2.0
- Role: vector-memory storage integration
- Status: INTEGRATED
- Upstream: https://github.com/qdrant/qdrant-client
- License copy: `thirdparty/LICENSES/qdrant-client.LICENSE`

Qdrant is used as the vector-memory layer behind KIYT's working, episodic and
semantic memory architecture.

## Future AGI Agent Learning Kit (ALK)

- Version: `0.3.5`
- Package: `agent-learning-kit`
- License: Apache-2.0
- Role: versioned evaluation artifacts for observed decision outcomes
- Status: INTEGRATED
- Upstream: https://github.com/future-agi/agent-learning-kit
- Verified release source: `a9323b5c893e4bc4a90243395fb195f7182f760b`
- License copy: `thirdparty/LICENSES/agent-learning-kit.LICENSE`
- Upstream notice: `thirdparty/LICENSES/agent-learning-kit.NOTICE`

KIYT uses ALK as an evaluator. ALK evaluation output is evidence input to
KIYT's deterministic reward mapper; ALK does not directly decide the reward
used for KIYT policy learning.

The exact integrated `0.3.5` release declares `Apache-2.0` and distributes
both `LICENSE` and `NOTICE`; both upstream files are retained in this
repository.


## MABWiser

- Version: `2.7.4`
- Package: `mabwiser`
- License: Apache-2.0
- Role: workspace-scoped contextual bandit policy using LinUCB
- Status: INTEGRATED
- Upstream: https://github.com/fidelity/mabwiser
- Verified release source: `b104071351d532aae977955d19b83872a9c1b1e3`
- License copy: `thirdparty/LICENSES/mabwiser.LICENSE`

KIYT uses MABWiser to select cognitive strategy from the versioned policy
arms `direct`, `retrieve_first`, `decompose_verify`, and `cautious_verify`.
Policy learning is isolated per workspace and durable policy evidence remains
owned by KIYT/PostgreSQL.
