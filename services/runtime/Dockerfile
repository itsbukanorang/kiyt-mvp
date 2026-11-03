FROM python:3.12.16-slim-bookworm

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

WORKDIR /app

COPY requirements.txt .

RUN python -m pip install \
    --no-cache-dir \
    --disable-pip-version-check \
    -r requirements.txt

RUN python -m spacy download en_core_web_sm && \
    python -c 'from importlib.metadata import version; assert version("en-core-web-sm") == "3.8.0"'

ENV FASTEMBED_CACHE_PATH=/opt/kiyt-fastembed

RUN mkdir -p /opt/kiyt-fastembed && \
    python - <<'PYMODEL'
from fastembed import (
    SparseTextEmbedding,
    TextEmbedding,
)

DENSE_MODEL = (
    "sentence-transformers/"
    "paraphrase-multilingual-MiniLM-L12-v2"
)

dense = TextEmbedding(
    model_name=DENSE_MODEL,
    cache_dir="/opt/kiyt-fastembed",
    threads=2,
)

assert dense.embedding_size == 384

sparse = SparseTextEmbedding(
    model_name="Qdrant/bm25",
    cache_dir="/opt/kiyt-fastembed",
)

probe = list(
    sparse.embed(
        ["kiyt bm25 production cache"]
    )
)

assert len(probe) == 1
assert len(probe[0].indices) > 0

print("KIYT_DENSE_MODEL_READY=384")
print("KIYT_BM25_MODEL_READY=PASS")
PYMODEL

RUN chmod -R a+rX /opt/kiyt-fastembed

ENV HOME=/tmp
ENV MEM0_DIR=/tmp/kiyt-mem0
ENV MEM0_TELEMETRY=false
ENV HF_HUB_OFFLINE=1

COPY --chown=65534:65534 --chmod=0444 \
    app.py \
    cognitive_graph.py \
    meta_reasoner.py \
    memory_adapter.py \
    /app/

USER 65534:65534

EXPOSE 8000

CMD ["python", "-m", "uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
