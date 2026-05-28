import asyncio
import json
import os
import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select
from sqlalchemy.orm import selectinload

# Ensure test defaults are in place before app modules resolve settings.
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

from app.api.v1.endpoints import scans as scans_endpoint
from app.core.deps import get_redis
from app.db.session import async_session_factory
from app.main import create_app
from app.models.scan import ModuleStatus, Scan, ScanStatus

LINKED_CANCEL_HOLD_URL = "https://iana.org/orbicheck-cancel-hold"
LINKED_CANCEL_HOLD_SECONDS = 30


def _should_hold_for_cancel(scan_url: str) -> bool:
    return scan_url == LINKED_CANCEL_HOLD_URL


class InMemoryPubSub:
    def __init__(self) -> None:
        self._channel: str | None = None

    async def subscribe(self, channel: str) -> None:
        self._channel = channel

    async def unsubscribe(self, *channels: str) -> None:
        _ = channels
        self._channel = None

    async def get_message(self, *args, **kwargs) -> None:
        _ = args, kwargs
        return None

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


class InMemoryRedis:
    def __init__(self) -> None:
        self._store: dict[str, str] = {}

    async def get(self, key: str) -> str | None:
        return self._store.get(key)

    async def set(self, key: str, value: str) -> bool:
        self._store[key] = value
        return True

    async def expire(self, key: str, _seconds: int) -> bool:
        return key in self._store

    async def exists(self, key: str) -> bool:
        return key in self._store

    async def setex(self, key: str, _seconds: int, value: str) -> bool:
        self._store[key] = value
        return True

    async def publish(self, *_args, **_kwargs) -> int:
        return 0

    def pubsub(self) -> InMemoryPubSub:
        return InMemoryPubSub()

    async def ping(self) -> bool:
        return True

    async def close(self) -> None:
        return None

    async def aclose(self) -> None:
        return None


redis_stub = InMemoryRedis()


def _progress_payload(
    progress: int,
    phase: str,
    detail: str,
    completed_modules: int,
    total_modules: int,
) -> dict[str, Any]:
    return {
        "progress": progress,
        "phase": phase,
        "detail": detail,
        "completedModules": completed_modules,
        "totalModules": total_modules,
    }


async def _run_deterministic_scan(scan_id: str) -> None:
    scan_uuid = uuid.UUID(scan_id)
    progress_key = f"scan:{scan_id}:progress"
    should_hold_for_cancel = False

    async with async_session_factory() as db:
        scan = (
            (
                await db.execute(
                    select(Scan)
                    .where(Scan.id == scan_uuid)
                    .options(selectinload(Scan.module_results))
                )
            )
            .scalar_one()
        )

        total = max(1, scan.total_modules)
        running_payload = _progress_payload(
            progress=35,
            phase="quick",
            detail="Running deterministic linked scan",
            completed_modules=0,
            total_modules=total,
        )
        await redis_stub.set(progress_key, json.dumps(running_payload))

        now = datetime.now(timezone.utc)
        scan.status = ScanStatus.RUNNING
        scan.started_at = now
        scan.progress = 35
        scan.completed_modules = 0
        should_hold_for_cancel = _should_hold_for_cancel(scan.url)

        for module in scan.module_results:
            module.status = ModuleStatus.SUCCESS
            module.duration_ms = 20
            module.completed_at = now
            module.error_message = None
            module.raw_result = {
                "module": module.module_name,
                "ok": True,
                "source": "linked-test-double",
            }

        if should_hold_for_cancel:
            await db.commit()
            await asyncio.sleep(LINKED_CANCEL_HOLD_SECONDS)
            await db.refresh(scan)
            if scan.status == ScanStatus.CANCELLED:
                await db.commit()
                return

        scan.status = ScanStatus.COMPLETED
        scan.progress = 100
        scan.completed_modules = total
        scan.security_score = 18
        scan.error_message = None
        scan.completed_at = datetime.now(timezone.utc)

        done_payload = _progress_payload(
            progress=100,
            phase="done",
            detail="Deterministic linked scan complete",
            completed_modules=total,
            total_modules=total,
        )
        await redis_stub.set(progress_key, json.dumps(done_payload))
        await redis_stub.expire(progress_key, 3600)

        await db.commit()


class DeterministicScanDispatcher:
    def delay(self, scan_id: str, *_args, **_kwargs) -> None:
        asyncio.create_task(_run_deterministic_scan(scan_id))


async def _get_redis_stub() -> InMemoryRedis:
    return redis_stub


async def _health_redis_override() -> InMemoryRedis:
    return redis_stub


app = create_app()

# Replace external side effects for linked tests only.
scans_endpoint.execute_scan = DeterministicScanDispatcher()  # type: ignore[assignment]
scans_endpoint.get_redis_async = _get_redis_stub  # type: ignore[assignment]
app.dependency_overrides[get_redis] = _health_redis_override
