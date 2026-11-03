import asyncio
import uuid

from memory_adapter import (
    EMBEDDING_DIMENSIONS,
    EMBEDDING_MODEL,
    KIYTMemoryAdapter,
    WORKING_COLLECTION,
)


async def main():
    marker = uuid.uuid4().hex

    workspace_id = (
        "module06-working-"
        + marker
    )

    other_workspace = (
        "module06-other-"
        + marker
    )

    run_a = (
        "run-a-"
        + marker
    )

    run_b = (
        "run-b-"
        + marker
    )

    memory = KIYTMemoryAdapter.from_env()

    await memory.ensure_ready()

    try:
        info = memory.client.get_collection(
            WORKING_COLLECTION
        )

        assert (
            info.config.params.vectors.size
            == EMBEDDING_DIMENSIONS
        )

        print(
            "W01_COLLECTION_DIMENSION=PASS"
        )

        await memory.upsert_working(
            workspace_id=workspace_id,
            run_id=run_a,
            objective=(
                "Validate working memory "
                + marker
            ),
        )

        recalled_a = await (
            memory.recall_working(
                workspace_id=workspace_id,
                run_id=run_a,
            )
        )

        working_a = recalled_a["working"]

        assert (
            working_a["objective"]
            == "Validate working memory "
            + marker
        )

        print(
            "W02_OBJECTIVE_WRITE_READ=PASS"
        )

        forbidden = {
            "context",
            "messages",
            "prompt",
            "chain_of_thought",
            "cot",
            "hidden_reasoning",
            "internal_reasoning",
        }

        assert not (
            forbidden
            & set(working_a)
        )

        assert "plan" not in working_a
        assert (
            "latest_observation"
            not in working_a
        )

        print(
            "W03_COMPACT_CONTRACT=PASS"
        )

        plan = {
            "step": "prepare-canary",
            "policy": (
                "hold before deployment"
            ),
        }

        await memory.upsert_working(
            workspace_id=workspace_id,
            run_id=run_b,
            objective=(
                "Continue rollout "
                + marker
            ),
            plan=plan,
        )

        recalled_b = await (
            memory.recall_working(
                workspace_id=workspace_id,
                run_id=run_b,
            )
        )

        assert (
            recalled_b["working"]["plan"]
            == plan
        )

        print(
            "W04_REAL_PLAN_PRESERVED=PASS"
        )

        observation = {
            "status": "policy_confirmed",
            "approval_required": True,
        }

        await memory.upsert_working(
            workspace_id=workspace_id,
            run_id=run_b,
            objective=(
                "Continue rollout "
                + marker
            ),
            latest_observation=observation,
        )

        recalled_b = await (
            memory.recall_working(
                workspace_id=workspace_id,
                run_id=run_b,
            )
        )

        assert (
            recalled_b["working"][
                "latest_observation"
            ]
            == observation
        )

        assert (
            recalled_b["working"]["plan"]
            == plan
        )

        print(
            "W05_LATEST_OBSERVATION=PASS"
        )

        isolated = await (
            memory.recall_working(
                workspace_id=other_workspace,
                run_id=run_b,
            )
        )

        assert isolated == {}

        print(
            "W06_WORKSPACE_ISOLATION=PASS"
        )

        wrong_run = await (
            memory.recall_working(
                workspace_id=workspace_id,
                run_id="wrong-" + marker,
            )
        )

        assert wrong_run == {}

        print(
            "W07_RUN_ISOLATION=PASS"
        )

        before_count = (
            memory.client.count(
                collection_name=(
                    WORKING_COLLECTION
                ),
                exact=True,
            ).count
        )

        updated_plan = {
            "step": "hold-orchid",
            "version": 2,
        }

        await memory.upsert_working(
            workspace_id=workspace_id,
            run_id=run_b,
            objective=(
                "Continue rollout "
                + marker
            ),
            plan=updated_plan,
        )

        after_count = (
            memory.client.count(
                collection_name=(
                    WORKING_COLLECTION
                ),
                exact=True,
            ).count
        )

        assert after_count == before_count

        updated = await (
            memory.recall_working(
                workspace_id=workspace_id,
                run_id=run_b,
            )
        )

        assert (
            updated["working"]["plan"]
            == updated_plan
        )

        assert (
            updated["working"][
                "latest_observation"
            ]
            == observation
        )

        assert (
            updated["working"][
                "embedding_model"
            ]
            == EMBEDDING_MODEL
        )

        print(
            "W08_DETERMINISTIC_RETRY=PASS"
        )

    finally:
        await memory.aclose()

    memory2 = KIYTMemoryAdapter.from_env()

    await memory2.ensure_ready()

    try:
        persisted = await (
            memory2.recall_working(
                workspace_id=workspace_id,
                run_id=run_b,
            )
        )

        assert (
            persisted["working"]["plan"]
            == updated_plan
        )

        assert (
            persisted["working"][
                "latest_observation"
            ]
            == observation
        )

        print(
            "W09_NEW_INSTANCE_PERSISTENCE=PASS"
        )

        await memory2.delete_working(
            workspace_id=workspace_id,
            run_id=run_a,
        )

        await memory2.delete_working(
            workspace_id=workspace_id,
            run_id=run_b,
        )

        assert (
            await memory2.recall_working(
                workspace_id=workspace_id,
                run_id=run_a,
            )
            == {}
        )

        assert (
            await memory2.recall_working(
                workspace_id=workspace_id,
                run_id=run_b,
            )
            == {}
        )

        print(
            "WORKING_TEST_FIXTURE_CLEANUP=PASS"
        )

    finally:
        await memory2.aclose()


asyncio.run(main())
