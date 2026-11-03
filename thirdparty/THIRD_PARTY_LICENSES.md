# KIYT Third-Party License Registry

| Component | License | Intended role | Integration status |
|---|---|---|---|
| LangGraph | MIT | Private cognitive graph | PLANNED |
| Mem0 OSS | Apache-2.0 | Memory extraction, update and deduplication | PLANNED |
| Future AGI Agent Learning Kit | Apache-2.0 | Evaluation artifacts and evidence | PLANNED |
| MABWiser | Apache-2.0 | Online contextual-bandit learning | PLANNED |
| jsonschema | MIT | Dynamic action-schema validation | INTEGRATED |

## License provenance

License files in LICENSES/ are retrieved from official
upstream repositories.

- LangGraph: https://github.com/langchain-ai/langgraph
- Mem0: https://github.com/mem0ai/mem0
- Agent Learning Kit: https://github.com/future-agi/agent-learning-kit
- MABWiser: https://github.com/fidelity/mabwiser

Checksums are recorded in LICENSES/SHA256SUMS.

These source-branch license snapshots do not establish
the exact dependency versions used in a release.

Before release:
- Pin tested package versions.
- Verify corresponding release licenses and NOTICE files.
- Audit transitive dependencies and license obligations.
- Record actual runtime integration tests.
- Keep operational secrets outside the public repository.
