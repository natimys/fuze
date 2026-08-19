#!/bin/sh
set -eu

load_secret() {
  variable="$1"
  file_variable="${variable}_FILE"
  eval "secret_file=\${$file_variable:-}"
  if [ -n "${secret_file:-}" ]; then
    value="$(cat "$secret_file")"
    export "$variable=$value"
  fi
}

for secret_name in DB_PASSWORD JWT_SECURITY_KEY CONFIG_ENCRYPTION_KEY MINIO_ACCESS_KEY MINIO_SECRET_KEY; do
  load_secret "$secret_name"
done

case "${1:-api}" in
  api)
    exec uvicorn main:app --host 0.0.0.0 --port 8000
    ;;
  migrate)
    exec alembic upgrade head
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
