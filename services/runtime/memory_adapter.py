"""KIYT-owned memory adapter.

Module 06 working-memory slice.

Rust remains the trusted tenant/lifecycle owner.
Qdrant stores memory.
Blocking embedding/vector operations run off the async event loop.
"""

from __future__ import annotations

import asyncio
from datetime import datetime, timezone
import json
import os
import ssl
import uuid
from typing import Any

from fastembed import TextEmbedding
from mem0 import Memory
from qdrant_client import QdrantClient, models


EMBEDDING_MODEL = (
    "sentence-transformers/"
    "paraphrase-multilingual-MiniLM-L12-v2"
)
EMBEDDING_DIMENSIONS = 384
EMBEDDING_CACHE = "/opt/kiyt-fastembed"

WORKING_COLLECTION = "working_memory"
EPISODIC_COLLECTION = "episodic_memory"
SEMANTIC_COLLECTION = "semantic_memory"

_POINT_NAMESPACE = uuid.UUID(
    "dbb95db7-9ca7-44fb-b925-927999bbb280"
)

_EPISODE_NAMESPACE = uuid.UUID(
    "6da41db4-1df4-4b5b-93eb-f0af0496df35"
)

_SEMANTIC_NAMESPACE = uuid.UUID(
    "a4fe4d4e-d774-4cf6-b06a-138af3f4577b"
)


class KIYTMemoryError(RuntimeError):
    pass


class KIYTMemoryAdapter:
    def __init__(
        self,
        *,
        qdrant_url: str,
        qdrant_api_key: str,
        qdrant_ca: str,
    ) -> None:
        if not qdrant_url:
            raise RuntimeError(
                "KIYT_QDRANT_URL is required"
            )

        if not qdrant_url.startswith("https://"):
            raise RuntimeError(
                "KIYT_QDRANT_URL must use https"
            )

        if not qdrant_api_key:
            raise RuntimeError(
                "KIYT_QDRANT_API_KEY is required"
            )

        if not qdrant_ca:
            raise RuntimeError(
                "KIYT_QDRANT_CA is required"
            )

        if not os.path.isfile(qdrant_ca):
            raise RuntimeError(
                "KIYT_QDRANT_CA file is missing"
            )

        self.qdrant_url = qdrant_url
        self.qdrant_api_key = qdrant_api_key
        self.qdrant_ca = qdrant_ca

        #
        # Mem0 = extraction/update/dedup helper.
        # KIYT remains canonical memory owner.
        #
        self._mem0_helper: Memory | None = None

        ssl_context = ssl.create_default_context(
            cafile=qdrant_ca
        )

        self.client = QdrantClient(
            url=qdrant_url,
            api_key=qdrant_api_key,
            timeout=10.0,
            verify=ssl_context,
            check_compatibility=False,
        )

        self.embedder: TextEmbedding | None = None

        self._io_gate = asyncio.Semaphore(2)

    @classmethod
    def from_env(
        cls,
    ) -> "KIYTMemoryAdapter":
        return cls(
            qdrant_url=os.environ.get(
                "KIYT_QDRANT_URL",
                "",
            ).strip(),
            qdrant_api_key=os.environ.get(
                "KIYT_QDRANT_API_KEY",
                "",
            ).strip(),
            qdrant_ca=os.environ.get(
                "KIYT_QDRANT_CA",
                "",
            ).strip(),
        )

    async def ensure_ready(
        self,
    ) -> None:
        async with self._io_gate:
            try:
                await asyncio.to_thread(
                    self._ensure_ready_sync
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "memory_initialization_failed"
                ) from exc

    def _ensure_ready_sync(
        self,
    ) -> None:
        self.embedder = TextEmbedding(
            model_name=EMBEDDING_MODEL,
            cache_dir=EMBEDDING_CACHE,
            threads=2,
            local_files_only=True,
        )

        actual_dimension = (
            self.embedder.embedding_size
        )

        if (
            actual_dimension
            != EMBEDDING_DIMENSIONS
        ):
            raise RuntimeError(
                "embedding_dimension_mismatch"
            )

        if not self.client.collection_exists(
            WORKING_COLLECTION
        ):
            self.client.create_collection(
                collection_name=(
                    WORKING_COLLECTION
                ),
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIMENSIONS,
                    distance=models.Distance.COSINE,
                ),
            )

        info = self.client.get_collection(
            WORKING_COLLECTION
        )

        vectors = info.config.params.vectors

        size = getattr(
            vectors,
            "size",
            None,
        )

        if size != EMBEDDING_DIMENSIONS:
            raise RuntimeError(
                "working_memory_dimension_mismatch"
            )

        if not self.client.collection_exists(
            EPISODIC_COLLECTION
        ):
            self.client.create_collection(
                collection_name=(
                    EPISODIC_COLLECTION
                ),
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIMENSIONS,
                    distance=models.Distance.COSINE,
                ),
            )

        episodic_info = (
            self.client.get_collection(
                EPISODIC_COLLECTION
            )
        )

        episodic_vectors = (
            episodic_info.config.params.vectors
        )

        episodic_size = getattr(
            episodic_vectors,
            "size",
            None,
        )

        if (
            episodic_size
            != EMBEDDING_DIMENSIONS
        ):
            raise RuntimeError(
                "episodic_memory_dimension_mismatch"
            )

        if not self.client.collection_exists(
            SEMANTIC_COLLECTION
        ):
            self.client.create_collection(
                collection_name=(
                    SEMANTIC_COLLECTION
                ),
                vectors_config=models.VectorParams(
                    size=EMBEDDING_DIMENSIONS,
                    distance=models.Distance.COSINE,
                ),
            )

        semantic_info = (
            self.client.get_collection(
                SEMANTIC_COLLECTION
            )
        )

        semantic_vectors = (
            semantic_info.config.params.vectors
        )

        semantic_size = getattr(
            semantic_vectors,
            "size",
            None,
        )

        if (
            semantic_size
            != EMBEDDING_DIMENSIONS
        ):
            raise RuntimeError(
                "semantic_memory_dimension_mismatch"
            )

    @staticmethod
    def _working_point_id(
        workspace_id: str,
        run_id: str,
    ) -> str:
        return str(
            uuid.uuid5(
                _POINT_NAMESPACE,
                (
                    "kiyt:working:"
                    + workspace_id
                    + ":"
                    + run_id
                ),
            )
        )

    async def _embed(
        self,
        text: str,
    ) -> list[float]:
        if self.embedder is None:
            raise KIYTMemoryError(
                "memory_not_initialized"
            )

        async with self._io_gate:
            try:
                vectors = await asyncio.to_thread(
                    lambda: list(
                        self.embedder.embed(
                            [text]
                        )
                    )
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "embedding_failed"
                ) from exc

        if len(vectors) != 1:
            raise KIYTMemoryError(
                "embedding_result_invalid"
            )

        vector = vectors[0].tolist()

        if len(vector) != EMBEDDING_DIMENSIONS:
            raise KIYTMemoryError(
                "embedding_dimension_mismatch"
            )

        return vector

    async def _retrieve_payload(
        self,
        *,
        workspace_id: str,
        run_id: str,
    ) -> dict[str, Any]:
        point_id = self._working_point_id(
            workspace_id,
            run_id,
        )

        async with self._io_gate:
            try:
                points = await asyncio.to_thread(
                    self.client.retrieve,
                    collection_name=(
                        WORKING_COLLECTION
                    ),
                    ids=[point_id],
                    with_payload=True,
                    with_vectors=False,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "working_memory_read_failed"
                ) from exc

        if not points:
            return {}

        payload = points[0].payload

        if not isinstance(payload, dict):
            raise KIYTMemoryError(
                "working_memory_payload_invalid"
            )

        if (
            payload.get("memory_type") != "working"
            or payload.get("workspace_id")
            != workspace_id
            or payload.get("run_id") != run_id
        ):
            raise KIYTMemoryError(
                "working_memory_scope_mismatch"
            )

        return dict(payload)

    async def upsert_working(
        self,
        *,
        workspace_id: str,
        run_id: str,
        objective: str,
        plan: Any = None,
        latest_observation: Any = None,
    ) -> None:
        if (
            not workspace_id
            or not run_id
            or not objective
        ):
            raise KIYTMemoryError(
                "working_memory_scope_invalid"
            )

        existing = await self._retrieve_payload(
            workspace_id=workspace_id,
            run_id=run_id,
        )

        effective_plan = (
            plan
            if plan is not None
            else existing.get("plan")
        )

        effective_observation = (
            latest_observation
            if latest_observation is not None
            else existing.get(
                "latest_observation"
            )
        )

        compact_state: dict[str, Any] = {
            "objective": objective,
        }

        if effective_plan is not None:
            compact_state[
                "plan"
            ] = effective_plan

        if effective_observation is not None:
            compact_state[
                "latest_observation"
            ] = effective_observation

        embedded_text = json.dumps(
            compact_state,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )

        vector = await self._embed(
            embedded_text
        )

        point_id = self._working_point_id(
            workspace_id,
            run_id,
        )

        payload: dict[str, Any] = {
            "memory_type": "working",
            "workspace_id": workspace_id,
            "run_id": run_id,
            "objective": objective,
            "provenance": "run_state",
            "embedding_model": EMBEDDING_MODEL,
            "embedding_dimensions": (
                EMBEDDING_DIMENSIONS
            ),
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }

        if effective_plan is not None:
            payload["plan"] = effective_plan

        if effective_observation is not None:
            payload[
                "latest_observation"
            ] = effective_observation

        async with self._io_gate:
            try:
                await asyncio.to_thread(
                    self.client.upsert,
                    collection_name=(
                        WORKING_COLLECTION
                    ),
                    points=[
                        models.PointStruct(
                            id=point_id,
                            vector=vector,
                            payload=payload,
                        )
                    ],
                    wait=True,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "working_memory_write_failed"
                ) from exc

    async def recall_working(
        self,
        *,
        workspace_id: str,
        run_id: str,
    ) -> dict[str, Any]:
        payload = await self._retrieve_payload(
            workspace_id=workspace_id,
            run_id=run_id,
        )

        if not payload:
            return {}

        return {
            "working": payload,
        }

    async def delete_working(
        self,
        *,
        workspace_id: str,
        run_id: str,
    ) -> None:
        point_id = self._working_point_id(
            workspace_id,
            run_id,
        )

        async with self._io_gate:
            try:
                await asyncio.to_thread(
                    self.client.delete,
                    collection_name=(
                        WORKING_COLLECTION
                    ),
                    points_selector=(
                        models.PointIdsList(
                            points=[point_id]
                        )
                    ),
                    wait=True,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "working_memory_delete_failed"
                ) from exc

\
    @staticmethod
    def _episode_point_id(
        workspace_id: str,
        run_id: str,
        decision_id: str,
        observation_id: str,
    ) -> str:
        return str(
            uuid.uuid5(
                _EPISODE_NAMESPACE,
                (
                    "kiyt:episode:"
                    + workspace_id
                    + ":"
                    + run_id
                    + ":"
                    + decision_id
                    + ":"
                    + observation_id
                ),
            )
        )

    async def upsert_episode(
        self,
        *,
        workspace_id: str,
        run_id: str,
        decision_id: str,
        observation_id: str,
        objective: str,
        decision: dict[str, Any],
        result: dict[str, Any],
    ) -> str:
        if (
            not workspace_id
            or not run_id
            or not decision_id
            or not observation_id
            or not objective
        ):
            raise KIYTMemoryError(
                "episodic_memory_scope_invalid"
            )

        if not isinstance(decision, dict):
            raise KIYTMemoryError(
                "episodic_decision_invalid"
            )

        if not isinstance(result, dict):
            raise KIYTMemoryError(
                "episodic_result_invalid"
            )

        outcome = result.get("status")

        if outcome not in {
            "success",
            "failure",
        }:
            raise KIYTMemoryError(
                "episodic_outcome_invalid"
            )

        canonical = {
            "objective": objective,
            "decision": decision,
            "result": result,
            "outcome": outcome,
        }

        embedded_text = json.dumps(
            canonical,
            ensure_ascii=False,
            sort_keys=True,
            separators=(",", ":"),
            default=str,
        )

        vector = await self._embed(
            embedded_text
        )

        point_id = self._episode_point_id(
            workspace_id,
            run_id,
            decision_id,
            observation_id,
        )

        payload = {
            "memory_type": "episodic",
            "workspace_id": workspace_id,
            "run_id": run_id,
            "decision_id": decision_id,
            "observation_id": observation_id,
            "objective": objective,
            "decision": decision,
            "result": result,
            "outcome": outcome,
            "provenance":
                "customer_observation",
            "trust":
                "observed_result",
            "embedding_model":
                EMBEDDING_MODEL,
            "embedding_dimensions":
                EMBEDDING_DIMENSIONS,
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }

        async with self._io_gate:
            try:
                await asyncio.to_thread(
                    self.client.upsert,
                    collection_name=(
                        EPISODIC_COLLECTION
                    ),
                    points=[
                        models.PointStruct(
                            id=point_id,
                            vector=vector,
                            payload=payload,
                        )
                    ],
                    wait=True,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "episodic_memory_write_failed"
                ) from exc

        return point_id

    async def recall_episodic(
        self,
        *,
        workspace_id: str,
        query: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        if not workspace_id:
            raise KIYTMemoryError(
                "episodic_workspace_required"
            )

        if not isinstance(query, str):
            raise KIYTMemoryError(
                "episodic_query_invalid"
            )

        clean_query = query.strip()

        if not clean_query:
            return []

        bounded_limit = max(
            1,
            min(int(limit), 10),
        )

        vector = await self._embed(
            clean_query[:20_000]
        )

        query_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="workspace_id",
                    match=models.MatchValue(
                        value=workspace_id
                    ),
                ),
                models.FieldCondition(
                    key="memory_type",
                    match=models.MatchValue(
                        value="episodic"
                    ),
                ),
            ]
        )

        async with self._io_gate:
            try:
                response = await asyncio.to_thread(
                    self.client.query_points,
                    collection_name=(
                        EPISODIC_COLLECTION
                    ),
                    query=vector,
                    query_filter=query_filter,
                    limit=bounded_limit,
                    with_payload=True,
                    with_vectors=False,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "episodic_memory_read_failed"
                ) from exc

        recalled: list[
            dict[str, Any]
        ] = []

        for point in response.points:
            payload = point.payload

            if not isinstance(payload, dict):
                continue

            if (
                payload.get("memory_type")
                != "episodic"
                or payload.get("workspace_id")
                != workspace_id
            ):
                continue

            item = dict(payload)
            item["score"] = float(
                point.score
            )

            recalled.append(item)

        return recalled

    async def delete_episode(
        self,
        *,
        workspace_id: str,
        run_id: str,
        decision_id: str,
        observation_id: str,
    ) -> None:
        point_id = self._episode_point_id(
            workspace_id,
            run_id,
            decision_id,
            observation_id,
        )

        async with self._io_gate:
            try:
                await asyncio.to_thread(
                    self.client.delete,
                    collection_name=(
                        EPISODIC_COLLECTION
                    ),
                    points_selector=(
                        models.PointIdsList(
                            points=[point_id]
                        )
                    ),
                    wait=True,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "episodic_memory_delete_failed"
                ) from exc

    def _get_mem0_helper(
        self,
    ) -> Memory:
        if self._mem0_helper is not None:
            return self._mem0_helper

        model_api_key = os.environ.get(
            "MODEL_API_KEY",
            "",
        ).strip()

        if not model_api_key:
            raise KIYTMemoryError(
                "semantic_extraction_model_key_missing"
            )

        config = {
            "llm": {
                "provider": "openai",
                "config": {
                    "api_key":
                        model_api_key,
                    "model":
                        "muse-spark-1.3",
                    "openai_base_url":
                        "https://api.meta.ai/v1",
                    "temperature":
                        0.1,
                    "max_tokens":
                        2000,
                    "is_reasoning_model":
                        False,
                    "store":
                        False,
                },
            },

            "embedder": {
                "provider": "fastembed",
                "config": {
                    "model":
                        EMBEDDING_MODEL,
                    "embedding_dims":
                        EMBEDDING_DIMENSIONS,
                },
            },

            #
            # Mem0 helper-only collection.
            #
            # Reuse KIYT's already-authenticated,
            # CA-verified remote Qdrant client.
            # This keeps Mem0 non-canonical while
            # avoiding embedded-Qdrant behavior and
            # its invalid local payload-index warning.
            #
            "vector_store": {
                "provider": "qdrant",
                "config": {
                    "collection_name":
                        "kiyt_mem0_semantic_helper",
                    "embedding_model_dims":
                        EMBEDDING_DIMENSIONS,
                    "client":
                        self.client,
                    "url":
                        self.qdrant_url,
                    "api_key":
                        self.qdrant_api_key,
                },
            },
        }

        try:
            self._mem0_helper = (
                Memory.from_config(config)
            )
        except Exception as exc:
            raise KIYTMemoryError(
                "mem0_semantic_init_failed"
            ) from exc

        return self._mem0_helper

    @staticmethod
    def _mem0_result_texts(
        result: Any,
    ) -> list[str]:
        if isinstance(result, dict):
            items = result.get(
                "results",
                [],
            )

        elif isinstance(result, list):
            items = result

        else:
            items = []

        texts: list[str] = []

        for item in items:
            if not isinstance(item, dict):
                continue

            event = str(
                item.get("event")
                or ""
            ).upper()

            if event in {
                "DELETE",
                "NONE",
                "NOOP",
            }:
                continue

            value = (
                item.get("memory")
                or item.get("text")
                or item.get("data")
                or item.get("content")
            )

            if not isinstance(value, str):
                continue

            normalized = " ".join(
                value.strip().split()
            )

            if (
                normalized
                and normalized not in texts
            ):
                texts.append(normalized)

        return texts

    async def extract_semantic_candidates(
        self,
        *,
        workspace_id: str,
        messages: list[dict[str, str]],
        source_id: str,
    ) -> list[dict[str, Any]]:
        if not workspace_id:
            raise KIYTMemoryError(
                "semantic_workspace_required"
            )

        if not source_id:
            raise KIYTMemoryError(
                "semantic_source_id_required"
            )

        if (
            not isinstance(messages, list)
            or not messages
        ):
            raise KIYTMemoryError(
                "semantic_messages_required"
            )

        normalized_messages: list[
            dict[str, str]
        ] = []

        for message in messages:
            if not isinstance(message, dict):
                raise KIYTMemoryError(
                    "semantic_message_invalid"
                )

            role = message.get("role")
            content = message.get("content")

            if role not in {
                "user",
                "assistant",
            }:
                raise KIYTMemoryError(
                    "semantic_message_role_invalid"
                )

            if (
                not isinstance(content, str)
                or not content.strip()
            ):
                raise KIYTMemoryError(
                    "semantic_message_content_invalid"
                )

            normalized_messages.append(
                {
                    "role": role,
                    "content":
                        content.strip(),
                }
            )

        helper = self._get_mem0_helper()

        try:
            result = await asyncio.to_thread(
                helper.add,
                normalized_messages,
                user_id=workspace_id,
                metadata={
                    "workspace_id":
                        workspace_id,
                    "source_id":
                        source_id,
                    "memory_type":
                        "semantic_candidate",
                },
                infer=True,
            )

        except Exception as exc:
            raise KIYTMemoryError(
                "mem0_semantic_extraction_failed"
            ) from exc

        texts = self._mem0_result_texts(result)

        candidates: list[
            dict[str, Any]
        ] = []

        for text in texts:
            point_id = (
                await self.upsert_semantic(
                    workspace_id=
                        workspace_id,
                    text=text,
                    source_kind=
                        "model_derived",
                    source_id=
                        source_id,
                )
            )

            candidates.append(
                {
                    "point_id":
                        point_id,
                    "text":
                        text,
                    "trust":
                        "candidate",
                    "provenance":
                        "model_derived",
                }
            )

        return candidates

    @staticmethod
    def _normalize_semantic_text(
        text: str,
    ) -> str:
        return " ".join(
            text.strip().split()
        )

    @classmethod
    def _semantic_point_id(
        cls,
        workspace_id: str,
        text: str,
    ) -> str:
        normalized = (
            cls._normalize_semantic_text(
                text
            )
        )

        return str(
            uuid.uuid5(
                _SEMANTIC_NAMESPACE,
                (
                    "kiyt:semantic:"
                    + workspace_id
                    + ":"
                    + normalized
                ),
            )
        )

    async def upsert_semantic(
        self,
        *,
        workspace_id: str,
        text: str,
        source_kind: str,
        source_id: str | None = None,
        verification: dict[str, Any]
        | None = None,
    ) -> str:
        if not workspace_id:
            raise KIYTMemoryError(
                "semantic_workspace_required"
            )

        if not isinstance(text, str):
            raise KIYTMemoryError(
                "semantic_text_invalid"
            )

        normalized = (
            self._normalize_semantic_text(
                text
            )
        )

        if not normalized:
            raise KIYTMemoryError(
                "semantic_text_required"
            )

        if len(normalized) > 20_000:
            raise KIYTMemoryError(
                "semantic_text_too_large"
            )

        if source_kind not in {
            "customer_provided",
            "model_derived",
            "verified",
        }:
            raise KIYTMemoryError(
                "semantic_source_invalid"
            )

        if (
            source_kind == "customer_provided"
        ):
            trust = "customer_provided"
            provenance = "customer_provided"

        elif source_kind == "model_derived":
            #
            # Non-negotiable:
            # model output is always candidate.
            #
            trust = "candidate"
            provenance = "model_derived"
            verification = None

        else:
            if not isinstance(
                verification,
                dict,
            ):
                raise KIYTMemoryError(
                    "semantic_verification_required"
                )

            verified_by = (
                verification.get(
                    "verified_by"
                )
            )

            if (
                not isinstance(
                    verified_by,
                    str,
                )
                or not verified_by.strip()
            ):
                raise KIYTMemoryError(
                    "semantic_verifier_required"
                )

            trust = "verified"
            provenance = "verification"

        point_id = (
            self._semantic_point_id(
                workspace_id,
                normalized,
            )
        )

        existing = None

        async with self._io_gate:
            try:
                points = (
                    await asyncio.to_thread(
                        self.client.retrieve,
                        collection_name=(
                            SEMANTIC_COLLECTION
                        ),
                        ids=[point_id],
                        with_payload=True,
                        with_vectors=False,
                    )
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "semantic_memory_read_failed"
                ) from exc

        if points:
            payload = points[0].payload

            if isinstance(payload, dict):
                existing = payload

        trust_rank = {
            "candidate": 0,
            "customer_provided": 1,
            "verified": 2,
        }

        if isinstance(existing, dict):
            existing_trust = (
                existing.get("trust")
            )

            if (
                existing_trust
                in trust_rank
                and trust_rank[
                    existing_trust
                ]
                > trust_rank[trust]
            ):
                #
                # A lower-trust retry/model output
                # cannot downgrade stronger truth.
                #
                return point_id

        vector = await self._embed(
            normalized
        )

        payload: dict[str, Any] = {
            "memory_type": "semantic",
            "workspace_id": workspace_id,
            "text": normalized,
            "source_kind": source_kind,
            "source_id": source_id,
            "provenance": provenance,
            "trust": trust,
            "embedding_model":
                EMBEDDING_MODEL,
            "embedding_dimensions":
                EMBEDDING_DIMENSIONS,
            "updated_at": datetime.now(
                timezone.utc
            ).isoformat(),
        }

        if trust == "verified":
            payload["verification"] = (
                verification
            )

        async with self._io_gate:
            try:
                await asyncio.to_thread(
                    self.client.upsert,
                    collection_name=(
                        SEMANTIC_COLLECTION
                    ),
                    points=[
                        models.PointStruct(
                            id=point_id,
                            vector=vector,
                            payload=payload,
                        )
                    ],
                    wait=True,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "semantic_memory_write_failed"
                ) from exc

        return point_id

    async def recall_semantic(
        self,
        *,
        workspace_id: str,
        query: str,
        limit: int = 5,
    ) -> list[dict[str, Any]]:
        if not workspace_id:
            raise KIYTMemoryError(
                "semantic_workspace_required"
            )

        if not isinstance(query, str):
            raise KIYTMemoryError(
                "semantic_query_invalid"
            )

        clean_query = query.strip()

        if not clean_query:
            return []

        bounded_limit = max(
            1,
            min(int(limit), 10),
        )

        vector = await self._embed(
            clean_query[:20_000]
        )

        query_filter = models.Filter(
            must=[
                models.FieldCondition(
                    key="workspace_id",
                    match=models.MatchValue(
                        value=workspace_id
                    ),
                ),
                models.FieldCondition(
                    key="memory_type",
                    match=models.MatchValue(
                        value="semantic"
                    ),
                ),
            ]
        )

        async with self._io_gate:
            try:
                response = (
                    await asyncio.to_thread(
                        self.client.query_points,
                        collection_name=(
                            SEMANTIC_COLLECTION
                        ),
                        query=vector,
                        query_filter=query_filter,
                        limit=bounded_limit,
                        with_payload=True,
                        with_vectors=False,
                    )
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "semantic_memory_read_failed"
                ) from exc

        recalled: list[
            dict[str, Any]
        ] = []

        for point in response.points:
            payload = point.payload

            if not isinstance(
                payload,
                dict,
            ):
                continue

            if (
                payload.get("memory_type")
                != "semantic"
                or payload.get(
                    "workspace_id"
                )
                != workspace_id
            ):
                continue

            item = dict(payload)

            item["score"] = float(
                point.score
            )

            recalled.append(item)

        return recalled

    async def delete_semantic(
        self,
        *,
        workspace_id: str,
        text: str,
    ) -> None:
        point_id = (
            self._semantic_point_id(
                workspace_id,
                text,
            )
        )

        async with self._io_gate:
            try:
                await asyncio.to_thread(
                    self.client.delete,
                    collection_name=(
                        SEMANTIC_COLLECTION
                    ),
                    points_selector=(
                        models.PointIdsList(
                            points=[point_id]
                        )
                    ),
                    wait=True,
                )
            except Exception as exc:
                raise KIYTMemoryError(
                    "semantic_memory_delete_failed"
                ) from exc

    async def aclose(
        self,
    ) -> None:
        helper = self._mem0_helper

        if helper is not None:
            #
            # Mem0.close() releases its own
            # SQLite/history resources.
            #
            # Its vector store shares self.client,
            # therefore the Qdrant client is closed
            # exactly once below by KIYT.
            #
            await asyncio.to_thread(
                helper.close
            )

            self._mem0_helper = None

        await asyncio.to_thread(
            self.client.close
        )
