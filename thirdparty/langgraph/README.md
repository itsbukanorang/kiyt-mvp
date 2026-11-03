# LangGraph — KIYT Runtime Adapter

Upstream: https://github.com/langchain-ai/langgraph

License: MIT
Pinned direct dependency: langgraph==1.2.19

Integration:
- `services/runtime/cognitive_graph.py`
- `thirdparty/langgraph/test_integration.py`

The graph invokes an injected asynchronous reasoner.
No fixed business-decision rules are encoded.

Safety validation ensures a selected action belongs to
the customer's supplied available_actions.

This is a graph integration, not evidence of real Meta
inference or a completed durable cognitive run.

Transitive dependency locking and license audit remain
release requirements.
