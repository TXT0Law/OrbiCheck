"""Persist Phase 3 channel dispatch attempts and schedule retries.

Every channel adapter wraps its outbound call in
:func:`record_dispatch_attempt`. On success the row's ``status`` is set to
``succeeded`` and ``next_attempt_at`` is cleared. On failure the row stays
``pending`` until ``attempts >= max_attempts`` at which point it transitions
to ``dead`` and the retry task ignores it.

The Celery task ``app.tasks.notification_tasks.retry_notification_dispatch``
loops through all ``status='failed'`` rows whose ``next_attempt_at`` has
fired, increments ``attempts``, and re-runs the channel adapter via
``replay_dispatch``.
"""

from __future__ import annotations

import json
import time
import uuid
from datetime import datetime, timedelta, timezone
from typing import Any, Awaitable, Callable

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.notification_dispatch import (
    NOTIFICATION_DISPATCH_STATUS_DEAD,
    NOTIFICATION_DISPATCH_STATUS_FAILED,
    NOTIFICATION_DISPATCH_STATUS_PENDING,
    NOTIFICATION_DISPATCH_STATUS_SUCCEEDED,
    NotificationDispatchLog,
)
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelDispatchResult,
)

logger = structlog.get_logger(__name__)


def _utc_now() -> datetime:
    return datetime.now(timezone.utc)


def _payload_to_jsonable(payload: AlertPayload) -> dict[str, Any]:
    """Pydantic ``model_dump`` then JSON-serialise via ``json.dumps`` so the
    JSONB column never sees a non-serialisable object (datetime / UUID)."""

    return json.loads(payload.model_dump_json())


def _next_backoff_at(attempt: int, *, now: datetime | None = None) -> datetime:
    base = float(settings.NOTIFICATION_RETRY_BASE_DELAY_S)
    cap = float(settings.NOTIFICATION_RETRY_MAX_DELAY_S)
    # Exponential backoff capped at NOTIFICATION_RETRY_MAX_DELAY_S.
    raw = base * (2 ** max(0, attempt - 1))
    delay = min(raw, cap)
    anchor = now or _utc_now()
    return anchor + timedelta(seconds=delay)


async def reserve_attempt(
    *,
    user_id: int,
    monitor_id: uuid.UUID | None,
    alert_event_id: uuid.UUID | None,
    channel_id: str,
    payload: AlertPayload,
    db: AsyncSession,
) -> NotificationDispatchLog:
    """Create a ``pending`` row before the channel adapter fires.

    Doing this *before* the network call means a process crash doesn't lose
    the attempt — the retry task will pick the row up on the next tick.
    """

    row = NotificationDispatchLog(
        user_id=user_id,
        monitor_id=monitor_id,
        alert_event_id=alert_event_id,
        channel_id=channel_id,
        event_type=payload.event_type,
        dedup_key=payload.dedup_key,
        payload=_payload_to_jsonable(payload),
        status=NOTIFICATION_DISPATCH_STATUS_PENDING,
        attempts=0,
        max_attempts=int(settings.NOTIFICATION_DISPATCH_MAX_ATTEMPTS),
    )
    db.add(row)
    await db.flush()
    return row


async def mark_result(
    *,
    row: NotificationDispatchLog,
    result: ChannelDispatchResult,
    db: AsyncSession,
    now: datetime | None = None,
) -> NotificationDispatchLog:
    """Apply a :class:`ChannelDispatchResult` to a dispatch row."""

    moment = now or _utc_now()
    row.attempts = int(row.attempts or 0) + 1
    if result.success:
        row.status = NOTIFICATION_DISPATCH_STATUS_SUCCEEDED
        row.last_error = None
        row.next_attempt_at = None
        row.succeeded_at = moment
    else:
        row.last_error = (result.error or "")[:1000] or None
        if row.attempts >= int(row.max_attempts or 0):
            row.status = NOTIFICATION_DISPATCH_STATUS_DEAD
            row.next_attempt_at = None
        else:
            row.status = NOTIFICATION_DISPATCH_STATUS_FAILED
            row.next_attempt_at = _next_backoff_at(row.attempts, now=moment)
    await db.flush()
    return row


async def record_dispatch_attempt(
    *,
    user_id: int,
    monitor_id: uuid.UUID | None,
    alert_event_id: uuid.UUID | None,
    channel_id: str,
    payload: AlertPayload,
    send: Callable[[], Awaitable[ChannelDispatchResult]],
    db: AsyncSession,
) -> ChannelDispatchResult:
    """Reserve a row, run ``send``, persist the outcome — all in one place.

    Adapters call this from the registry-level dispatch helper rather than
    bookkeeping themselves so failures are always tracked exactly once.
    """

    row = await reserve_attempt(
        user_id=user_id,
        monitor_id=monitor_id,
        alert_event_id=alert_event_id,
        channel_id=channel_id,
        payload=payload,
        db=db,
    )
    started = time.perf_counter()
    try:
        result = await send()
    except Exception as exc:  # noqa: BLE001 - adapters wrap their own exc
        # Defensive: the channels themselves should never raise (they
        # convert to ``ChannelDispatchResult(success=False)``). If one
        # does, surface it as a regular failure so the retry queue picks
        # it up rather than crashing the whole alert pipeline.
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        result = ChannelDispatchResult(
            success=False,
            error=str(exc)[:500],
            latency_ms=elapsed_ms,
            attempt=int(row.attempts or 0) + 1,
        )
        logger.warning(
            "notification_channel_unhandled_exception",
            channel_id=channel_id,
            user_id=user_id,
            monitor_id=str(monitor_id) if monitor_id else None,
            error=str(exc)[:200],
        )

    enriched = result.model_copy(
        update={
            "attempt": int(row.attempts or 0) + 1,
            "dispatch_log_id": row.id,
        }
    )
    await mark_result(row=row, result=enriched, db=db)
    logger.info(
        "notification_channel_dispatched",
        channel_id=channel_id,
        user_id=user_id,
        monitor_id=str(monitor_id) if monitor_id else None,
        success=enriched.success,
        attempt=enriched.attempt,
        latency_ms=enriched.latency_ms,
        dispatch_log_id=str(row.id),
    )
    return enriched


async def list_dispatch_pending(
    *, db: AsyncSession, now: datetime | None = None, limit: int = 50
) -> list[NotificationDispatchLog]:
    """Pick failed rows that are due for retry."""

    moment = now or _utc_now()
    stmt = (
        select(NotificationDispatchLog)
        .where(
            NotificationDispatchLog.status == NOTIFICATION_DISPATCH_STATUS_FAILED,
            NotificationDispatchLog.next_attempt_at.is_not(None),
            NotificationDispatchLog.next_attempt_at <= moment,
        )
        .order_by(NotificationDispatchLog.next_attempt_at.asc())
        .limit(limit)
    )
    rows = (await db.execute(stmt)).scalars().all()
    return list(rows)


async def replay_dispatch(
    *,
    row: NotificationDispatchLog,
    send: Callable[[], Awaitable[ChannelDispatchResult]],
    db: AsyncSession,
    now: datetime | None = None,
) -> ChannelDispatchResult:
    """Re-run ``send`` for an existing dispatch row (called by the retry task)."""

    started = time.perf_counter()
    try:
        result = await send()
    except Exception as exc:  # noqa: BLE001 - same rationale as above
        elapsed_ms = int((time.perf_counter() - started) * 1000)
        result = ChannelDispatchResult(
            success=False,
            error=str(exc)[:500],
            latency_ms=elapsed_ms,
            attempt=int(row.attempts or 0) + 1,
        )
        logger.warning(
            "notification_channel_retry_unhandled_exception",
            channel_id=row.channel_id,
            user_id=row.user_id,
            error=str(exc)[:200],
        )
    enriched = result.model_copy(
        update={
            "attempt": int(row.attempts or 0) + 1,
            "dispatch_log_id": row.id,
        }
    )
    await mark_result(row=row, result=enriched, db=db, now=now)
    return enriched
