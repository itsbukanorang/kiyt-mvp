import hmac
import os

from fastapi import FastAPI, Header, HTTPException


app = FastAPI(
    title="KIYT Private Cognitive Runtime",
    docs_url=None,
    redoc_url=None,
    openapi_url=None,
)

INTERNAL_TOKEN = os.environ["KIYT_INTERNAL_TOKEN"]


@app.get("/healthz")
async def healthz(
    x_kiyt_internal_token: str | None = Header(default=None),
) -> dict[str, str]:
    if (
        x_kiyt_internal_token is None
        or not hmac.compare_digest(
            x_kiyt_internal_token,
            INTERNAL_TOKEN,
        )
    ):
        raise HTTPException(
            status_code=401,
            detail="unauthorized",
        )

    return {
        "status": "ok",
        "service": "kiyt-runtime",
        "runtime": "python",
        "visibility": "private",
    }
