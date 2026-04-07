#!/usr/bin/env bash

set -euo pipefail

cd /app/backend

case "${CELERY_MODE:-worker}" in
  worker)
    exec uv run celery -A app.core.celery_app.celery_app worker \
      --loglevel="${CELERY_LOG_LEVEL:-info}" \
      --concurrency="${CELERY_WORKER_CONCURRENCY:-4}"
    ;;
  beat)
    exec uv run celery -A app.core.celery_app.celery_app beat \
      --loglevel="${CELERY_LOG_LEVEL:-info}"
    ;;
  *)
    echo "Unsupported CELERY_MODE: ${CELERY_MODE:-}" >&2
    exit 1
    ;;
esac
