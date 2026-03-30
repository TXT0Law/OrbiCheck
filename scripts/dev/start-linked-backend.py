#!/usr/bin/env python3
import asyncio
import os
import subprocess
import sys

import asyncpg
import uvicorn


# Linked test backend defaults. Override via environment when needed.
os.environ.setdefault(
    "DATABASE_URL",
    "postgresql+asyncpg://postgres:postgres@127.0.0.1:5432/orbicheck_linked",
)
os.environ.setdefault("REDIS_URL", "redis://127.0.0.1:6379/0")
os.environ.setdefault(
    "CORS_ORIGINS",
    '["http://127.0.0.1:3101","http://127.0.0.1:3102"]',
)
os.environ.setdefault("APP_ENV", "test-linked")
os.environ.setdefault("DEBUG", "false")

from app.db.base import Base
from app.db.session import get_engine
from app.models import monitor, report, scan, url_group  # noqa: F401


def ensure_db_and_migrate() -> None:
    """Prepare the linked-test database and align Alembic state."""
    db_url = os.environ.get("DATABASE_URL", "")
    if "orbicheck_linked" in db_url:
        _create_db_if_missing(db_url)
        asyncio.run(_rebuild_linked_schema())
        _stamp_alembic_head()
        return

    _run_alembic_upgrade()


def _run_alembic_upgrade() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(os.path.dirname(os.path.dirname(script_dir)), "backend")
    orig_cwd = os.getcwd()
    try:
        os.chdir(backend_dir)
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "upgrade", "head"],
            capture_output=True,
            text=True,
            env=os.environ,
        )
        if result.returncode != 0:
            sys.stderr.write(f"Migration warning: {result.stderr or result.stdout}\n")
    finally:
        os.chdir(orig_cwd)


def _stamp_alembic_head() -> None:
    script_dir = os.path.dirname(os.path.abspath(__file__))
    backend_dir = os.path.join(os.path.dirname(os.path.dirname(script_dir)), "backend")
    orig_cwd = os.getcwd()
    try:
        os.chdir(backend_dir)
        result = subprocess.run(
            [sys.executable, "-m", "alembic", "stamp", "head"],
            capture_output=True,
            text=True,
            env=os.environ,
        )
        if result.returncode != 0:
            sys.stderr.write(f"Migration warning: {result.stderr or result.stdout}\n")
    finally:
        os.chdir(orig_cwd)


def _create_db_if_missing(db_url: str) -> None:
    """Create orbicheck_linked database if it does not exist."""
    try:
        url = db_url.replace("postgresql+asyncpg://", "postgresql://")
        base = url.rsplit("/", 1)[0]
        postgres_url = f"{base}/postgres"
        asyncio.run(_do_create_db(postgres_url))
    except Exception:
        pass


async def _do_create_db(postgres_url: str) -> None:
    conn = await asyncpg.connect(postgres_url)
    try:
        await conn.execute("CREATE DATABASE orbicheck_linked")
    except asyncpg.DuplicateDatabaseError:
        pass
    finally:
        await conn.close()


async def _rebuild_linked_schema() -> None:
    """Reset the dedicated linked-test schema to the current ORM metadata."""
    engine = get_engine()
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    await engine.dispose()


if __name__ == "__main__":
    ensure_db_and_migrate()
    uvicorn.run(
        "app.test_linked_main:app",
        host=os.getenv("LINKED_BACKEND_HOST", "127.0.0.1"),
        port=int(os.getenv("LINKED_BACKEND_PORT", "8010")),
        reload=False,
        log_level=os.getenv("LINKED_BACKEND_LOG_LEVEL", "warning"),
    )
