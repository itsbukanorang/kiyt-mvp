import asyncio
import os
import uuid

from memory_adapter import (
    EMBEDDING_DIMENSIONS,
    EPISODIC_COLLECTION,
    KIYTMemoryAdapter,
)


async def main():
    marker = uuid.uuid4().hex

    workspace_a = (
        "episodic-a-" + marker
    )

    workspace_b = (
        "episodic-b-" + marker
    )

    run_success = (
        "run-success-" + marker
    )

    run_failure = (
        "run-failure-" + marker
    )

    decision_success = (
        "decision-success-" + marker
    )

    decision_failure = (
        "decision-failure-" + marker
    )

    observation_success = (
        "observation-success-" + marker
    )

    observation_failure = (
        "observation-failure-" + marker
    )

    success_objective = (
        "Deploy ORCHID service safely "
        + marker
    )

    failure_objective = (
        "Retry COBALT provider request "
        + marker
    )

    success_decision = {
        "status": "requires_action",
        "action": {
            "name": "deploy_orchid",
            "arguments": {
                "strategy": "canary",
            },
        },
        "reason_summary":
            "Canary deployment selected.",
    }

    failure_decision = {
        "status": "requires_action",
        "action": {
            "name": "retry_cobalt",
            "arguments": {
                "attempt": 2,
            },
        },
        "reason_summary":
            "Retry selected after timeout.",
    }

    success_result = {
        "status": "success",
        "output": {
            "health": "200",
            "marker": marker,
        },
    }

    failure_result = {
        "status": "failure",
        "output": {
            "error": "rate_limited",
            "marker": marker,
        },
    }

    memory = KIYTMemoryAdapter.from_env()

    await memory.ensure_ready()

    try:
        info = memory.client.get_collection(
            EPISODIC_COLLECTION
        )

        assert (
            info.config.params.vectors.size
            == EMBEDDING_DIMENSIONS
        )

        print(
            "EA01_COLLECTION_384=PASS"
        )

        success_point = (
            await memory.upsert_episode(
                workspace_id=workspace_a,
                run_id=run_success,
                decision_id=decision_success,
                observation_id=observation_success,
                objective=success_objective,
                decision=success_decision,
                result=success_result,
            )
        )

        assert success_point

        print(
            "EA02_SUCCESS_WRITE=PASS"
        )

        failure_point = (
            await memory.upsert_episode(
                workspace_id=workspace_a,
                run_id=run_failure,
                decision_id=decision_failure,
                observation_id=observation_failure,
                objective=failure_objective,
                decision=failure_decision,
                result=failure_result,
            )
        )

        assert failure_point

        print(
            "EA03_FAILURE_WRITE=PASS"
        )

        count_before = memory.client.count(
            collection_name=(
                EPISODIC_COLLECTION
            ),
            exact=True,
        ).count

        assert count_before == 2

        retry_point = (
            await memory.upsert_episode(
                workspace_id=workspace_a,
                run_id=run_success,
                decision_id=decision_success,
                observation_id=observation_success,
                objective=success_objective,
                decision=success_decision,
                result=success_result,
            )
        )

        assert retry_point == success_point

        count_after = memory.client.count(
            collection_name=(
                EPISODIC_COLLECTION
            ),
            exact=True,
        ).count

        assert count_after == count_before

        print(
            "EA04_DETERMINISTIC_RETRY=PASS"
        )

        success_hits = (
            await memory.recall_episodic(
                workspace_id=workspace_a,
                query=(
                    "ORCHID canary deployment "
                    + marker
                ),
                limit=5,
            )
        )

        assert success_hits

        success_match = next(
            item
            for item in success_hits
            if item["run_id"]
            == run_success
        )

        assert (
            success_match["objective"]
            == success_objective
        )

        assert (
            success_match["decision"][
                "action"
            ]["name"]
            == "deploy_orchid"
        )

        assert (
            success_match["result"][
                "status"
            ]
            == "success"
        )

        assert (
            success_match["outcome"]
            == "success"
        )

        print(
            "EA05_SEMANTIC_RECALL=PASS"
        )
        print(
            "EA06_DECISION_RESULT_FIDELITY=PASS"
        )

        failure_hits = (
            await memory.recall_episodic(
                workspace_id=workspace_a,
                query=(
                    "COBALT provider rate limited "
                    + marker
                ),
                limit=5,
            )
        )

        failure_match = next(
            item
            for item in failure_hits
            if item["run_id"]
            == run_failure
        )

        assert (
            failure_match["outcome"]
            == "failure"
        )

        assert (
            failure_match["result"][
                "status"
            ]
            == "failure"
        )

        assert (
            failure_match["result"][
                "output"
            ]["error"]
            == "rate_limited"
        )

        print(
            "EA07_FAILURE_STAYS_FAILURE=PASS"
        )

        isolated = (
            await memory.recall_episodic(
                workspace_id=workspace_b,
                query=marker,
                limit=10,
            )
        )

        assert isolated == []

        print(
            "EA08_WORKSPACE_ISOLATION=PASS"
        )

    finally:
        await memory.aclose()

    memory2 = KIYTMemoryAdapter.from_env()

    await memory2.ensure_ready()

    try:
        persisted = (
            await memory2.recall_episodic(
                workspace_id=workspace_a,
                query=(
                    "COBALT provider failure "
                    + marker
                ),
                limit=10,
            )
        )

        assert any(
            item["run_id"] == run_failure
            and item["outcome"] == "failure"
            for item in persisted
        )

        print(
            "EA09_NEW_INSTANCE_PERSISTENCE=PASS"
        )

        await memory2.delete_episode(
            workspace_id=workspace_a,
            run_id=run_success,
            decision_id=decision_success,
            observation_id=observation_success,
        )

        await memory2.delete_episode(
            workspace_id=workspace_a,
            run_id=run_failure,
            decision_id=decision_failure,
            observation_id=observation_failure,
        )

        count = memory2.client.count(
            collection_name=(
                EPISODIC_COLLECTION
            ),
            exact=True,
        ).count

        assert count == 0

        print(
            "EA10_FIXTURE_CLEANUP=PASS"
        )

    finally:
        await memory2.aclose()


asyncio.run(main())
