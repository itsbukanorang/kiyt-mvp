import hmac
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


INTERNAL_TOKEN = os.environ[
    "KIYT_INTERNAL_TOKEN"
]


class CognitionRequest(BaseModel):
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

    app.state.reasoner = reasoner

    try:
        yield
    finally:
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

    async def live_reasoner(
        state: dict[str, Any],
    ) -> dict[str, Any]:
        result = await (
            request.app.state.reasoner.reason(
                state
            )
        )

        captured["meta"] = result

        return result.decision

    graph = build_graph(
        live_reasoner
    )

    try:
        result = await graph.ainvoke(
            {
                "objective": objective,
                "context": payload.context,
                "available_actions": (
                    payload.available_actions
                ),
                "decision": None,
            }
        )

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
