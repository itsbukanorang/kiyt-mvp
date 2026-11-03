"""Synthetic graph fixture, NOT Meta inference evidence."""

import asyncio

from cognitive_graph import build_graph


async def main():
    calls = []

    async def fixture_reasoner(state):
        calls.append(state["objective"])
        return {
            "status": "requires_action",
            "action": {
                "name": "customer_action",
                "arguments": {"verified": True},
            },
            "reason_summary": "Synthetic test only",
        }

    graph = build_graph(fixture_reasoner)

    state = {
        "objective": "synthetic integration test",
        "context": {},
        "available_actions": [
            {"name": "customer_action"}
        ],
        "decision": None,
    }

    result = await graph.ainvoke(state)

    assert calls == ["synthetic integration test"]
    assert result["decision"]["status"] == "requires_action"
    assert result["decision"]["action"]["name"] == "customer_action"

    print("POSITIVE_GRAPH_EXECUTION=PASS")

    async def invalid_reasoner(_state):
        return {
            "status": "requires_action",
            "action": {
                "name": "invented_action",
                "arguments": {},
            },
        }

    try:
        await build_graph(invalid_reasoner).ainvoke(state)
    except ValueError as exc:
        assert "action_not_allowed" in str(exc)
    else:
        raise AssertionError("invalid action was accepted")

    print("NEGATIVE_ACTION_GATE=PASS")

    try:
        await graph.ainvoke({
            **state,
            "objective": "",
        })
    except ValueError as exc:
        assert "objective_required" in str(exc)
    else:
        raise AssertionError("empty objective was accepted")

    print("NEGATIVE_OBJECTIVE_GATE=PASS")


if __name__ == "__main__":
    asyncio.run(main())
