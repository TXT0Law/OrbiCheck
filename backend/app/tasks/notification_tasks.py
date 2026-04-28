"""Celery tasks for the Phase 3 notification retry queue.

The channel adapter framework (``app.services.notification_channels``)
records every dispatch attempt in ``osint_notification_dispatch_log``. When
an attempt fails, the row's ``status`` becomes ``failed`` and
``next_attempt_at`` is set via exponential backoff. This task is the worker
that re-fires those rows.
"""

from __future__ import annotations

import asyncio
import uuid
from datetime import datetime, timezone
from typing import Any

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import celery_app
from app.db.session import async_session_factory
from app.models.notification_dispatch import (
    NOTIFICATION_DISPATCH_STATUS_FAILED,
    NotificationDispatchLog,
)
from app.services.notification_channels.dispatch_log import (
    list_dispatch_pending,
    replay_dispatch,
)
from app.services.notification_channels.registry import get_channel
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelConfig,
    ChannelDispatchResult,
)
from app.services.user_notification_settings import get_notification_settings

logger = structlog.get_logger(__name__)

NOTIFICATION_RETRY_BATCH_SIZE: int = 50


def _payload_from_log(row: NotificationDispatchLog) -> AlertPayload:
    """Re-hydrate the AlertPayload originally stored on the log row."""

    return AlertPayload.model_validate(row.payload)


async def _resolve_channel_config(
    *, user_id: int, channel_id: str
) -> ChannelConfig:
    """Pull current per-channel config from Redis."""

    from redis.asyncio import Redis

    from app.core.config import settings
    from app.services.notification_channels.registry import (
        resolve_channel_configs,
    )

    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        user_settings = await get_notification_settings(redis, user_id)
        return resolve_channel_configs(user_settings).get(
            channel_id
        ) or ChannelConfig()
    finally:
        await redis.aclose()


async def _retry_one(row: NotificationDispatchLog, db: AsyncSession) -> ChannelDispatchResult:
    channel = get_channel(row.channel_id)
    if channel is None:
        logger.warning(
            "notification_retry_unknown_channel",
            channel_id=row.channel_id,
            log_id=str(row.id),
        )
        # Mark as dead by exhausting attempts so the queue stops picking it up.
        row.attempts = int(row.max_attempts or 0)
        result = ChannelDispatchResult(
            success=False,
            error=f"unknown_channel:{row.channel_id}",
            latency_ms=0,
            attempt=row.attempts,
        )
        await replay_dispatch(row=row, send=lambda: _async_noop(result), db=db)
        return result
    payload = _payload_from_log(row)
    config = await _resolve_channel_config(
        user_id=row.user_id, channel_id=row.channel_id
    )
    return await replay_dispatch(
        row=row,
        send=lambda: channel.send(payload, config),
        db=db,
    )


async def _async_noop(result: ChannelDispatchResult) -> ChannelDispatchResult:
    return result


@celery_app.task(name="app.tasks.notification_tasks.retry_notification_dispatch")
def retry_notification_dispatch() -> dict[str, Any]:
    """Re-fire any dispatch_log row whose ``next_attempt_at`` has elapsed.

    Bounded by ``NOTIFICATION_RETRY_BATCH_SIZE`` per tick so a backlog does
    not starve the rest of the worker.
    """

    async def _run() -> dict[str, Any]:
        succeeded = 0
        failed = 0
        async with async_session_factory() as db:
            try:
                rows = await list_dispatch_pending(
                    db=db, limit=NOTIFICATION_RETRY_BATCH_SIZE
                )
                for row in rows:
                    result = await _retry_one(row, db)
                    if result.success:
                        succeeded += 1
                    else:
                        failed += 1
                await db.commit()
            except Exception:
                await db.rollback()
                raise
        return {
            "processed": succeeded + failed,
            "succeeded": succeeded,
            "failed": failed,
        }

    return asyncio.run(_run())


@celery_app.task(
    name="app.tasks.notification_tasks.retry_single_notification",
    bind=True,
    max_retries=0,
)
def retry_single_notification(self, log_id: str) -> dict[str, Any]:
    """Retry a single dispatch row by id (called by API for manual replay)."""

    async def _run() -> dict[str, Any]:
        async with async_session_factory() as db:
            try:
                row = await db.execute(
                    select(NotificationDispatchLog).where(
                        NotificationDispatchLog.id == uuid.UUID(log_id)
                    )
                )
                target = row.scalar_one_or_none()
                if target is None:
                    return {"log_id": log_id, "status": "missing"}
                if target.status != NOTIFICATION_DISPATCH_STATUS_FAILED:
                    return {"log_id": log_id, "status": "not_failed"}
                # Force eligibility regardless of next_attempt_at.
                target.next_attempt_at = datetime.now(timezone.utc)
                result = await _retry_one(target, db)
                await db.commit()
                return {
                    "log_id": log_id,
                    "status": "succeeded" if result.success else "failed",
                    "error": result.error,
                }
            except Exception:
                await db.rollback()
                raise

    return asyncio.run(_run())
