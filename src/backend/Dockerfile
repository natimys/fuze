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

RUN groupadd --system fuze \
    && useradd --system --gid fuze --home-dir /app --no-create-home fuze

COPY --from=builder --chown=fuze:fuze /app/.venv /app/.venv
COPY --from=builder --chown=fuze:fuze /app/src/backend /app/src/backend

COPY --chown=fuze:fuze src/backend/alembic.ini .
COPY --chown=fuze:fuze src/backend/alembic ./alembic

ENV PATH="/app/.venv/bin:$PATH"
ENV PYTHONPATH="/app/src/backend"

WORKDIR /app/src/backend

COPY --chown=fuze:fuze src/backend/entrypoint.sh .

RUN chmod +x entrypoint.sh

USER fuze

EXPOSE 8000

ENTRYPOINT ["./entrypoint.sh"]
CMD ["api"]
