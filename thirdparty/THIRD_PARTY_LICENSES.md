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
