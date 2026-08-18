#!/bin/sh
set -eu

case "${1:-api}" in
  api)
    alembic upgrade head
    exec uvicorn main:app --host 0.0.0.0 --port 8000
    ;;
  worker)
    exec celery -A worker.celery_app:celery_app worker \
      --loglevel=INFO --concurrency="${CELERY_WORKER_CONCURRENCY:-2}"
    ;;
  beat)
    exec celery -A worker.celery_app:celery_app beat \
      --loglevel=INFO --schedule=/tmp/fuze-celerybeat-schedule
    ;;
  *)
    exec "$@"
    ;;
esac
