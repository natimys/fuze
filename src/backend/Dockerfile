FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

COPY src/backend ./src/backend

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen


FROM python:3.12-slim-bookworm

WORKDIR /app

COPY --from=builder /app/.venv /app/.venv
COPY --from=builder /app/src/backend /app/src/backend

COPY src/backend/alembic.ini .
COPY src/backend/alembic ./alembic

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src"

WORKDIR /app/src/backend

COPY src/backend/entrypoint.sh .

RUN chmod +x entrypoint.sh

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]