FROM ghcr.io/astral-sh/uv:python3.12-bookworm-slim AS builder

WORKDIR /app

ENV UV_COMPILE_BYTECODE=1
ENV UV_LINK_MODE=copy

COPY pyproject.toml uv.lock ./

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen --no-install-project

COPY src/backend ./src/backend
COPY src/cli ./src/cli

RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen


FROM node:22-bookworm-slim AS node-runtime


FROM python:3.12-slim-bookworm

ARG FFMPEG_VERSION=7:5.1.9-0+deb12u1
ARG VERSION=dev
ARG REVISION=unknown
ARG CREATED=unknown

LABEL org.opencontainers.image.title="Fuze backend" \
      org.opencontainers.image.version="$VERSION" \
      org.opencontainers.image.revision="$REVISION" \
      org.opencontainers.image.source="https://github.com/natimys/fuze" \
      org.opencontainers.image.created="$CREATED"

WORKDIR /app

RUN apt-get update \
    && apt-get install --yes --no-install-recommends \
        "ffmpeg=${FFMPEG_VERSION}" \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --system fuze \
    && useradd --system --gid fuze --home-dir /app --no-create-home fuze

COPY --from=builder --chown=fuze:fuze /app/.venv /app/.venv
COPY --from=builder --chown=fuze:fuze /app/src/backend /app/src/backend
COPY --from=builder --chown=fuze:fuze /app/src/cli /app/src/cli
COPY --from=node-runtime /usr/local/bin/node /usr/local/bin/node

RUN mkdir -p /app/src/backend/bin \
    && ln -s /app/.venv/bin/yt-dlp /app/src/backend/bin/yt-dlp \
    && ln -s /usr/bin/ffmpeg /app/src/backend/bin/ffmpeg \
    && ln -s /usr/bin/ffprobe /app/src/backend/bin/ffprobe \
    && ln -s /usr/local/bin/node /app/src/backend/bin/node

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
