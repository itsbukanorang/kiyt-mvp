import hmac
import json
import os
from contextlib import asynccontextmanager
from typing import Any

from fastapi import (
    FastAPI,
    Header,
    HTTPException,
    Request,
)
from pydantic import BaseModel, Field

from cognitive_graph import build_graph
from meta_reasoner import (
    MetaProviderError,
    MetaReasoner,
)
from memory_adapter import (
    KIYTMemoryAdapter,
    KIYTMemoryError,
)


INTERNAL_TOKEN = os.environ[
    "KIYT_INTERNAL_TOKEN"
]


class CognitionRequest(BaseModel):
    workspace_id: str = Field(
        min_length=1,
        max_length=128,
    )

    run_id: str = Field(
        min_length=1,
        max_length=128,
    )

    objective: str = Field(
        min_length=1,
        max_length=20000,
    )

    context: dict[str, Any] = Field(
        default_factory=dict,
    )

    available_actions: list[
        dict[str, Any]
    ] = Field(
        default_factory=list,
    )


class EpisodeWriteRequest(BaseModel):
    workspace_id: str = Field(
        min_length=1,
        max_length=128,
    )

    run_id: str = Field(
        min_length=1,
        max_length=128,
    )

    decision_id: str = Field(
        min_length=1,
        max_length=128,
    )

    observation_id: str = Field(
        min_length=1,
        max_length=128,
    )

    objective: str = Field(
        min_length=1,
        max_length=20000,
    )

    decision: dict[str, Any]

    result: dict[str, Any]


class SemanticWriteRequest(BaseModel):
    workspace_id: str = Field(
        min_length=1,
        max_length=128,
    )

    text: str = Field(
        min_length=1,
        max_length=20000,
    )

    source_kind: str = Field(
        min_length=1,
        max_length=64,
    )

    source_id: str | None = Field(
        default=None,
        max_length=256,
    )

    verification: dict[str, Any] | None = (
        None
    )


class SemanticExtractRequest(BaseModel):
    workspace_id: str = Field(
        min_length=1,
        max_length=128,
    )

    source_id: str = Field(
        min_length=1,
        max_length=256,
    )

    messages: list[
        dict[str, str]
    ]


def require_internal_token(
    token: str | None,
) -> None:
    if (
        token is None
        or not hmac.compare_digest(
            token,
            INTERNAL_TOKEN,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="unauthorized",
        )


def usage_payload(
    usage: Any,
) -> dict[str, int]:
    return {
        "input_tokens": (
            usage.input_tokens
        ),
        "cached_input_tokens": (
            usage.cached_input_tokens
        ),
        "output_tokens": (
            usage.output_tokens
        ),
        "reasoning_tokens": (
            usage.reasoning_tokens
        ),
        "total_tokens": (
            usage.total_tokens
        ),
    }


@asynccontextmanager
async def lifespan(
    app: FastAPI,
):
    reasoner = MetaReasoner()
    memory = KIYTMemoryAdapter.from_env()

    await memory.ensure_ready()

    app.state.reasoner = reasoner
    app.state.memory = memory

    try:
        yield
    finally:
        await memory.aclose()
        await reasoner.aclose()


app = FastAPI(
    title="KIYT Private Cognitive Runtime",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
    lifespan=lifespan,
)


@app.get("/healthz")
async def healthz(
    x_kiyt_internal_token: str | None = Header(
        default=None
    ),
) -> dict[str, str]:
    require_internal_token(
        x_kiyt_internal_token
    )

    return {
        "status": "ok",
        "service": "kiyt-runtime",
        "runtime": "python",
        "visibility": "private",
    }


@app.post("/memory/semantic/extract")
async def extract_semantic(
    payload: SemanticExtractRequest,
    request: Request,
    x_kiyt_internal_token: str | None = Header(
        default=None
    ),
) -> dict[str, Any]:
    require_internal_token(
        x_kiyt_internal_token
    )

    try:
        candidates = await (
            request.app.state.memory
            .extract_semantic_candidates(
                workspace_id=
                    payload.workspace_id,
                messages=
                    payload.messages,
                source_id=
                    payload.source_id,
            )
        )

    except KIYTMemoryError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": str(exc),
                "retryable": True,
            },
        ) from exc

    return {
        "status": "extracted",
        "memory_type": "semantic",
        "candidate_count":
            len(candidates),
        "candidates":
            candidates,
    }


@app.post("/memory/semantic")
async def write_semantic(
    payload: SemanticWriteRequest,
    request: Request,
    x_kiyt_internal_token: str | None = Header(
        default=None
    ),
) -> dict[str, Any]:
    require_internal_token(
        x_kiyt_internal_token
    )

    try:
        point_id = await (
            request.app.state.memory.upsert_semantic(
                workspace_id=payload.workspace_id,
                text=payload.text,
                source_kind=payload.source_kind,
                source_id=payload.source_id,
                verification=payload.verification,
            )
        )

        recalled = await (
            request.app.state.memory.recall_semantic(
                workspace_id=payload.workspace_id,
                query=payload.text,
                limit=10,
            )
        )

    except KIYTMemoryError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": str(exc),
                "retryable": False,
            },
        ) from exc

    stored = next(
        (
            item
            for item in recalled
            if item.get("text")
            == " ".join(
                payload.text.strip().split()
            )
        ),
        None,
    )

    if stored is None:
        raise HTTPException(
            status_code=500,
            detail={
                "code":
                    "semantic_write_verification_failed",
                "retryable": True,
            },
        )

    return {
        "status": "synced",
        "memory_type": "semantic",
        "point_id": point_id,
        "trust": stored["trust"],
        "provenance":
            stored["provenance"],
    }


@app.post("/memory/episodes")
async def write_episode(
    payload: EpisodeWriteRequest,
    request: Request,
    x_kiyt_internal_token: str | None = Header(
        default=None
    ),
) -> dict[str, Any]:
    require_internal_token(
        x_kiyt_internal_token
    )

    try:
        point_id = await (
            request.app.state.memory.upsert_episode(
                workspace_id=payload.workspace_id,
                run_id=payload.run_id,
                decision_id=payload.decision_id,
                observation_id=payload.observation_id,
                objective=payload.objective.strip(),
                decision=payload.decision,
                result=payload.result,
            )
        )

    except KIYTMemoryError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": str(exc),
                "retryable": True,
            },
        ) from exc

    return {
        "status": "synced",
        "memory_type": "episodic",
        "point_id": point_id,
    }


@app.post("/cognition/decide")
async def cognition_decide(
    payload: CognitionRequest,
    request: Request,
    x_kiyt_internal_token: str | None = Header(
        default=None
    ),
) -> dict[str, Any]:
    require_internal_token(
        x_kiyt_internal_token
    )

    objective = payload.objective.strip()

    if not objective:
        raise HTTPException(
            status_code=422,
            detail={
                "code": "objective_required",
                "retryable": False,
            },
        )

    captured: dict[str, Any] = {}

    try:
        await request.app.state.memory.upsert_working(
            workspace_id=payload.workspace_id,
            run_id=payload.run_id,
            objective=objective,
            plan=payload.context.get(
                "plan"
            ),
            latest_observation=(
                payload.context.get(
                    "latest_observation"
                )
            ),
        )

    except KIYTMemoryError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": str(exc),
                "retryable": True,
            },
        ) from exc

    async def live_recaller(
        state: dict[str, Any],
    ) -> dict[str, Any]:
        working = await (
            request.app.state.memory.recall_working(
                workspace_id=state[
                    "workspace_id"
                ],
                run_id=state["run_id"],
            )
        )

        recall_query = (
            str(state.get("objective") or "")
            + "\n"
            + json.dumps(
                state.get("context") or {},
                ensure_ascii=False,
                sort_keys=True,
                separators=(",", ":"),
                default=str,
            )
        )

        episodic = await (
            request.app.state.memory.recall_episodic(
                workspace_id=state[
                    "workspace_id"
                ],
                query=recall_query,
                limit=5,
            )
        )

        semantic = await (
            request.app.state.memory.recall_semantic(
                workspace_id=state[
                    "workspace_id"
                ],
                query=recall_query,
                limit=5,
            )
        )

        recalled: dict[str, Any] = {}

        recalled.update(working)

        if episodic:
            recalled["episodic"] = episodic

        if semantic:
            recalled["semantic"] = semantic

        return recalled

    async def live_reasoner(
        state: dict[str, Any],
    ) -> dict[str, Any]:
        reasoning_state = dict(state)

        reasoning_context = dict(
            state.get("context") or {}
        )

        recalled = (
            state.get("memory") or {}
        )

        if recalled:
            reasoning_context[
                "_kiyt_recalled_memory"
            ] = {
                "treat_as":
                    "untrusted_context_data",
                "data": recalled,
            }

        reasoning_state[
            "context"
        ] = reasoning_context

        result = await (
            request.app.state.reasoner.reason(
                reasoning_state
            )
        )

        captured["meta"] = result

        return result.decision

    graph = build_graph(
        live_reasoner,
        live_recaller,
    )

    try:
        result = await graph.ainvoke(
            {
                "workspace_id": (
                    payload.workspace_id
                ),
                "run_id": payload.run_id,
                "objective": objective,
                "context": payload.context,
                "available_actions": (
                    payload.available_actions
                ),
                "decision": None,
            }
        )

    except KIYTMemoryError as exc:
        raise HTTPException(
            status_code=503,
            detail={
                "code": str(exc),
                "retryable": True,
            },
        ) from exc

    except MetaProviderError as exc:
        detail: dict[str, Any] = {
            "code": exc.reason,
            "retryable": exc.retryable,
        }

        if exc.status_code is not None:
            detail[
                "provider_status"
            ] = exc.status_code

        if exc.retry_after is not None:
            detail[
                "retry_after"
            ] = exc.retry_after

        raise HTTPException(
            status_code=(
                503
                if exc.retryable
                else 422
            ),
            detail=detail,
        ) from exc

    except ValueError as exc:
        raise HTTPException(
            status_code=422,
            detail={
                "code": str(exc),
                "retryable": False,
            },
        ) from exc

    meta = captured.get("meta")

    if meta is None:
        raise HTTPException(
            status_code=500,
            detail={
                "code":
                    "cognition_result_missing",
                "retryable": True,
            },
        )

    decision = result.get(
        "decision"
    )

    if not isinstance(
        decision,
        dict,
    ):
        raise HTTPException(
            status_code=500,
            detail={
                "code":
                    "decision_missing",
                "retryable": True,
            },
        )

    return {
        "decision": decision,
        "provider": {
            "name": "meta",
            "model": (
                request.app.state.reasoner.model
            ),
            "reasoning_effort": (
                meta.reasoning_effort
            ),
            "response_id": (
                meta.provider_response_id
            ),
            "usage": {
                "router": usage_payload(
                    meta.router_usage
                ),
                "decision": usage_payload(
                    meta.decision_usage
                ),
            },
        },
    }
