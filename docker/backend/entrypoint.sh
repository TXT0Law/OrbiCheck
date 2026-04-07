#!/usr/bin/env bash

set -euo pipefail

cd /app/backend

bootstrap_mode="$(
  uv run python - <<'PY'
import asyncio

from sqlalchemy import inspect
from sqlalchemy.ext.asyncio import create_async_engine

from app.core.config import settings
from app.db.base import Base
from app.models import *  # noqa: F401,F403


async def main() -> None:
    engine = create_async_engine(settings.DATABASE_URL)
    try:
        async with engine.begin() as connection:
            def get_tables(sync_connection):
                return set(inspect(sync_connection).get_table_names())

            tables = await connection.run_sync(get_tables)
            if "alembic_version" in tables:
                print("upgrade")
                return

            await connection.run_sync(Base.metadata.create_all)
            print("stamp")
    finally:
        await engine.dispose()


asyncio.run(main())
PY
)"

if [ "${bootstrap_mode}" = "stamp" ]; then
  uv run alembic stamp head
else
  uv run alembic upgrade head
fi

if [ "$#" -eq 0 ]; then
  set -- uv run uvicorn app.main:app --host 0.0.0.0 --port 8000
fi

exec "$@"
