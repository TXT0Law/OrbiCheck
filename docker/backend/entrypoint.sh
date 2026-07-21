#!/usr/bin/env bash

set -euo pipefail

cd /app/backend

# Alembic is the only production schema authority. Creating ORM tables and
# stamping head would silently skip data, enum, rename, and backfill migrations.
alembic upgrade head

if [ "$#" -eq 0 ]; then
  set -- uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

exec "$@"
