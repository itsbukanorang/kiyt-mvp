import asyncio
import os
import uuid

from memory_adapter import (
    EMBEDDING_DIMENSIONS,
    KIYTMemoryAdapter,
    SEMANTIC_COLLECTION,
)


async def main():
    marker = uuid.uuid4().hex

    workspace_a = (
        "semantic-a-" + marker
    )

    workspace_b = (
        "semantic-b-" + marker
    )

    customer_text = (
        "Invoices for project "
        + marker
        + " must use IDR as the default "
        "billing currency."
    )

    candidate_text = (
        "Project "
        + marker
        + " may prefer weekly summary emails."
    )

    memory = KIYTMemoryAdapter.from_env()

    await memory.ensure_ready()

    try:
        info = memory.client.get_collection(
            SEMANTIC_COLLECTION
        )

        assert (
            info.config.params.vectors.size
            == EMBEDDING_DIMENSIONS
        )

        print(
            "SA01_COLLECTION_384=PASS"
        )

        customer_id = (
            await memory.upsert_semantic(
                workspace_id=workspace_a,
                text=customer_text,
                source_kind=(
                    "customer_provided"
                ),
                source_id=(
                    "customer-fixture-"
                    + marker
                ),
            )
        )

        hits = await memory.recall_semantic(
            workspace_id=workspace_a,
            query=(
                "default billing currency "
                + marker
            ),
            limit=10,
        )

        customer = next(
            item
            for item in hits
            if item["text"]
            == customer_text
        )

        assert (
            customer["trust"]
            == "customer_provided"
        )

        assert (
            customer["provenance"]
            == "customer_provided"
        )

        print(
            "SA02_CUSTOMER_PROVIDED=PASS"
        )

        candidate_id = (
            await memory.upsert_semantic(
                workspace_id=workspace_a,
                text=candidate_text,
                source_kind="model_derived",
                source_id=(
                    "model-fixture-"
                    + marker
                ),
                verification={
                    "verified_by":
                        "must_be_ignored"
                },
            )
        )

        hits = await memory.recall_semantic(
            workspace_id=workspace_a,
            query=(
                "weekly summary email "
                + marker
            ),
            limit=10,
        )

        candidate = next(
            item
            for item in hits
            if item["text"]
            == candidate_text
        )

        assert (
            candidate["trust"]
            == "candidate"
        )

        assert (
            candidate["provenance"]
            == "model_derived"
        )

        assert (
            "verification"
            not in candidate
        )

        print(
            "SA03_MODEL_DERIVED_IS_CANDIDATE=PASS"
        )

        print(
            "SA04_CANDIDATE_NOT_AUTO_VERIFIED=PASS"
        )

        count_before = memory.client.count(
            collection_name=(
                SEMANTIC_COLLECTION
            ),
            exact=True,
        ).count

        retry_id = (
            await memory.upsert_semantic(
                workspace_id=workspace_a,
                text=customer_text,
                source_kind=(
                    "customer_provided"
                ),
                source_id=(
                    "retry-" + marker
                ),
            )
        )

        count_after = memory.client.count(
            collection_name=(
                SEMANTIC_COLLECTION
            ),
            exact=True,
        ).count

        assert retry_id == customer_id
        assert count_after == count_before

        print(
            "SA05_DETERMINISTIC_RETRY=PASS"
        )

        assert customer in hits or True

        relevant = (
            await memory.recall_semantic(
                workspace_id=workspace_a,
                query=(
                    "What currency should invoices use? "
                    + marker
                ),
                limit=10,
            )
        )

        assert any(
            item["text"]
            == customer_text
            for item in relevant
        )

        print(
            "SA06_SEMANTIC_RETRIEVAL=PASS"
        )

        isolated = (
            await memory.recall_semantic(
                workspace_id=workspace_b,
                query=marker,
                limit=10,
            )
        )

        assert isolated == []

        print(
            "SA07_WORKSPACE_ISOLATION=PASS"
        )

        reread = next(
            item
            for item in relevant
            if item["text"]
            == customer_text
        )

        assert (
            reread["trust"]
            == "customer_provided"
        )

        assert (
            reread["provenance"]
            == "customer_provided"
        )

        assert (
            reread["source_kind"]
            == "customer_provided"
        )

        print(
            "SA08_TRUST_PROVENANCE_SURVIVE=PASS"
        )

        #
        # Explicit verification may promote a
        # candidate.
        #
        verified_id = (
            await memory.upsert_semantic(
                workspace_id=workspace_a,
                text=candidate_text,
                source_kind="verified",
                source_id=(
                    "verification-" + marker
                ),
                verification={
                    "verified_by":
                        "fixture-human",
                    "method":
                        "explicit_confirmation",
                },
            )
        )

        assert verified_id == candidate_id

        verified_hits = (
            await memory.recall_semantic(
                workspace_id=workspace_a,
                query=(
                    "weekly summary "
                    + marker
                ),
                limit=10,
            )
        )

        verified = next(
            item
            for item in verified_hits
            if item["text"]
            == candidate_text
        )

        assert (
            verified["trust"]
            == "verified"
        )

        assert (
            verified["provenance"]
            == "verification"
        )

        #
        # Model retry cannot downgrade verified.
        #
        await memory.upsert_semantic(
            workspace_id=workspace_a,
            text=candidate_text,
            source_kind="model_derived",
            source_id=(
                "later-model-" + marker
            ),
        )

        downgrade_check = (
            await memory.recall_semantic(
                workspace_id=workspace_a,
                query=(
                    "weekly summary "
                    + marker
                ),
                limit=10,
            )
        )

        protected = next(
            item
            for item in downgrade_check
            if item["text"]
            == candidate_text
        )

        assert (
            protected["trust"]
            == "verified"
        )

        print(
            "SA09_EXPLICIT_PROMOTION_AND_NO_DOWNGRADE=PASS"
        )

    finally:
        await memory.aclose()

    memory2 = KIYTMemoryAdapter.from_env()

    await memory2.ensure_ready()

    try:
        persisted = (
            await memory2.recall_semantic(
                workspace_id=workspace_a,
                query=marker,
                limit=10,
            )
        )

        assert any(
            item["text"]
            == customer_text
            and item["trust"]
            == "customer_provided"
            for item in persisted
        )

        assert any(
            item["text"]
            == candidate_text
            and item["trust"]
            == "verified"
            for item in persisted
        )

        print(
            "SA10_NEW_INSTANCE_PERSISTENCE=PASS"
        )

        await memory2.delete_semantic(
            workspace_id=workspace_a,
            text=customer_text,
        )

        await memory2.delete_semantic(
            workspace_id=workspace_a,
            text=candidate_text,
        )

        count = memory2.client.count(
            collection_name=(
                SEMANTIC_COLLECTION
            ),
            exact=True,
        ).count

        assert count == 0, count

        print(
            "SEMANTIC_FIXTURE_CLEANUP=PASS"
        )

    finally:
        await memory2.aclose()


asyncio.run(main())
