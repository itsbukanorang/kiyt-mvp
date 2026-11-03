"""KIYT private LangGraph cognitive adapter.

LangGraph owns cognitive graph execution only.
Rust/PostgreSQL own durable operational lifecycle.
No customer actions are executed here.
"""

from typing import (
    Any,
    Awaitable,
    Callable,
    NotRequired,
    TypedDict,
)

from langgraph.graph import StateGraph, START, END


class CognitiveState(TypedDict):
    objective: str
    context: dict[str, Any]
    available_actions: list[dict[str, Any]]
    decision: dict[str, Any] | None
    workspace_id: NotRequired[str]
    run_id: NotRequired[str]
    memory: NotRequired[dict[str, Any]]


Reasoner = Callable[
    [CognitiveState],
    Awaitable[dict[str, Any]],
]

Recaller = Callable[
    [CognitiveState],
    Awaitable[dict[str, Any]],
]


def build_graph(
    reasoner: Reasoner,
    recaller: Recaller | None = None,
):
    """Inject model reasoning and optional KIYT memory recall."""

    async def perceive(state: CognitiveState):
        objective = state["objective"]

        if not isinstance(objective, str) or not objective.strip():
            raise ValueError("objective_required")

        actions = state["available_actions"]

        if not isinstance(actions, list):
            raise ValueError("invalid_available_actions")

        names = []
        for action in actions:
            if not isinstance(action, dict):
                raise ValueError("invalid_action_definition")
            name = action.get("name")
            if not isinstance(name, str) or not name.strip():
                raise ValueError("invalid_action_name")
            names.append(name)

        if len(names) != len(set(names)):
            raise ValueError("duplicate_action_name")

        return {}

    async def recall(state: CognitiveState):
        if recaller is None:
            return {
                "memory": {},
            }

        memory = await recaller(state)

        if not isinstance(memory, dict):
            raise ValueError(
                "invalid_memory_recall"
            )

        return {
            "memory": memory,
        }

    async def reason(state: CognitiveState):
        decision = await reasoner(state)

        if not isinstance(decision, dict):
            raise ValueError("invalid_reasoner_output")

        return {"decision": decision}

    async def decide(state: CognitiveState):
        decision = state["decision"]

        if not isinstance(decision, dict):
            raise ValueError("missing_decision")

        status = decision.get("status")
        action = decision.get("action")

        if status not in (
            "requires_action",
            "needs_input",
            "completed",
        ):
            raise ValueError("invalid_decision_status")

        if status == "requires_action":
            if not isinstance(action, dict):
                raise ValueError("action_required")

            name = action.get("name")
            arguments = action.get("arguments")

            allowed = {
                item["name"]
                for item in state["available_actions"]
            }

            if name not in allowed:
                raise ValueError("action_not_allowed")

            if not isinstance(arguments, dict):
                raise ValueError("invalid_action_arguments")

        elif action is not None:
            raise ValueError("unexpected_action")

        return {}

    graph = StateGraph(CognitiveState)

    graph.add_node("perceive", perceive)
    graph.add_node("recall", recall)
    graph.add_node("reason", reason)
    graph.add_node("decide", decide)

    graph.add_edge(START, "perceive")
    graph.add_edge("perceive", "recall")
    graph.add_edge("recall", "reason")
    graph.add_edge("reason", "decide")
    graph.add_edge("decide", END)

    return graph.compile()
