#!/usr/bin/env python3
import asyncio
import os
import subprocess
import sys

import asyncpg
import uvicorn


LINKED_TEST_AUTH_RATE_LIMIT = "100"
LINKED_TEST_DATABASE_NAME = "orbicheck_linked"


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
os.environ.setdefault("AUTH_LOGIN_EMAIL", "admin@orbicheck.local")
os.environ.setdefault("AUTH_LOGIN_PASSWORD", "linked-test-password")
os.environ.setdefault("AUTH_SESSION_SECRET", "linked-test-session-secret")
os.environ.setdefault("AUTH_COOKIE_SECURE", "false")
os.environ.setdefault("RATE_LIMIT_AUTH_REQUESTS", LINKED_TEST_AUTH_RATE_LIMIT)

def ensure_db_and_migrate() -> None:
    """Prepare the linked-test database exclusively through Alembic."""
    db_url = os.environ.get("DATABASE_URL", "")
    if LINKED_TEST_DATABASE_NAME in db_url:
        asyncio.run(_reset_linked_database(db_url))

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
            detail = result.stderr or result.stdout
            raise RuntimeError(f"Alembic migration failed: {detail}")
    finally:
        os.chdir(orig_cwd)


async def _reset_linked_database(db_url: str) -> None:
    """Recreate the isolated linked-test database before Alembic upgrade."""

    url = db_url.replace("postgresql+asyncpg://", "postgresql://")
    base = url.rsplit("/", 1)[0]
    postgres_url = f"{base}/postgres"
    conn = await asyncpg.connect(postgres_url)
    try:
        await conn.execute(
            """
            SELECT pg_terminate_backend(pid)
            FROM pg_stat_activity
            WHERE datname = $1 AND pid <> pg_backend_pid()
            """,
            LINKED_TEST_DATABASE_NAME,
        )
        await conn.execute(f'DROP DATABASE IF EXISTS "{LINKED_TEST_DATABASE_NAME}"')
        await conn.execute(f'CREATE DATABASE "{LINKED_TEST_DATABASE_NAME}"')
    finally:
        await conn.close()


if __name__ == "__main__":
    ensure_db_and_migrate()
    uvicorn.run(
        "app.test_linked_main:app",
        host=os.getenv("LINKED_BACKEND_HOST", "127.0.0.1"),
        port=int(os.getenv("LINKED_BACKEND_PORT", "8010")),
        reload=False,
        log_level=os.getenv("LINKED_BACKEND_LOG_LEVEL", "warning"),
    )
