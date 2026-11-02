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
from enum import StrEnum
from typing import Any

import structlog
from redis.asyncio import Redis
from redis.exceptions import RedisError
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.celery_app import celery_app
from app.core.config import settings
from app.db.session import async_session_factory
from app.models.notification_dispatch import (
    NOTIFICATION_DISPATCH_STATUS_FAILED,
    NotificationDispatchLog,
)
from app.services.notification_channels.dispatch_log import (
    list_dispatch_pending,
    replay_dispatch,
)
from app.services.finding_notification_event import (
    RISK_EVENT_DISPATCH_BATCH_SIZE,
    RISK_EVENT_UNRESOLVED_SAMPLE_SIZE,
    cancel_unattempted_risk_event_claim_in_transaction,
    claim_pending_risk_event_in_transaction,
    list_expired_claimed_risk_event_ids,
    list_pending_risk_event_ids,
    load_claimed_risk_send_snapshot,
    mark_claimed_risk_event_sent_in_transaction,
)
from app.services.notification_channels.scan_risk_webhook import (
    ScanRiskWebhookOutcome,
    send_scan_risk_webhook,
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


class ScanRiskDeliveryOutcome(StrEnum):
    NOT_CLAIMED = "not_claimed"
    CANCELLED = "cancelled"
    DISABLED = "disabled"
    BLOCKED = "blocked"
    STALE = "stale"
    PREFLIGHT_UNAVAILABLE = "preflight_unavailable"
    UNKNOWN = "unknown"
    SENT = "sent"
    CONFIRMATION_UNRECORDED = "confirmation_unrecorded"


async def deliver_one_scan_risk_event(event_id: uuid.UUID) -> ScanRiskDeliveryOutcome:
    """Deliver one evidence-backed event; callers must not auto-retry this.

    Each database phase closes before Redis or webhook I/O. A claimed event
    with an unknown external outcome is intentionally left claimed for
    inspection rather than automatically requeued after its lease expires.
    The bounded batch task invokes this function for each pending candidate.
    """
    async with async_session_factory() as db:
        async with db.begin():
            claim_token = await claim_pending_risk_event_in_transaction(db, event_id)
    if claim_token is None:
        return ScanRiskDeliveryOutcome.NOT_CLAIMED

    async with async_session_factory() as db:
        snapshot = await load_claimed_risk_send_snapshot(db, event_id, claim_token)
    if snapshot is None:
        async with async_session_factory() as db:
            async with db.begin():
                cancelled = await cancel_unattempted_risk_event_claim_in_transaction(
                    db, event_id, claim_token
                )
        return ScanRiskDeliveryOutcome.CANCELLED if cancelled else ScanRiskDeliveryOutcome.STALE

    try:
        redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            user_settings = await get_notification_settings(redis, snapshot.user_id)
        finally:
            await redis.aclose()
    except (RedisError, OSError, ValueError) as exc:
        logger.warning(
            "scan_risk_notification_preflight_unavailable",
            event_id=str(event_id),
            error_type=type(exc).__name__,
        )
        return ScanRiskDeliveryOutcome.PREFLIGHT_UNAVAILABLE

    # Redis may have been slow while a rescan or retry invalidated this claim.
    # Read a fresh evidence snapshot before network I/O, without holding a lock.
    async with async_session_factory() as db:
        fresh_snapshot = await load_claimed_risk_send_snapshot(db, event_id, claim_token)
    if fresh_snapshot is None or fresh_snapshot.user_id != snapshot.user_id:
        async with async_session_factory() as db:
            async with db.begin():
                cancelled = await cancel_unattempted_risk_event_claim_in_transaction(
                    db, event_id, claim_token
                )
        return ScanRiskDeliveryOutcome.CANCELLED if cancelled else ScanRiskDeliveryOutcome.STALE

    webhook_outcome = await send_scan_risk_webhook(fresh_snapshot.payload, user_settings)
    if webhook_outcome in (ScanRiskWebhookOutcome.DISABLED, ScanRiskWebhookOutcome.BLOCKED):
        async with async_session_factory() as db:
            async with db.begin():
                cancelled = await cancel_unattempted_risk_event_claim_in_transaction(
                    db, event_id, claim_token
                )
        if not cancelled:
            return ScanRiskDeliveryOutcome.STALE
        return (
            ScanRiskDeliveryOutcome.DISABLED
            if webhook_outcome is ScanRiskWebhookOutcome.DISABLED
            else ScanRiskDeliveryOutcome.BLOCKED
        )
    if webhook_outcome is ScanRiskWebhookOutcome.UNKNOWN:
        return ScanRiskDeliveryOutcome.UNKNOWN
    if webhook_outcome is not ScanRiskWebhookOutcome.CONFIRMED:
        return ScanRiskDeliveryOutcome.UNKNOWN

    async with async_session_factory() as db:
        async with db.begin():
            recorded = await mark_claimed_risk_event_sent_in_transaction(
                db, event_id, claim_token
            )
    if not recorded:
        logger.warning("scan_risk_notification_confirmation_unrecorded", event_id=str(event_id))
        return ScanRiskDeliveryOutcome.CONFIRMATION_UNRECORDED
    return ScanRiskDeliveryOutcome.SENT


async def _dispatch_pending_scan_risk_events() -> dict[str, Any]:
    """Read one bounded candidate page, then release the session before delivery."""
    async with async_session_factory() as db:
        event_ids = await list_pending_risk_event_ids(db, RISK_EVENT_DISPATCH_BATCH_SIZE)
        unresolved_ids = await list_expired_claimed_risk_event_ids(
            db, RISK_EVENT_UNRESOLVED_SAMPLE_SIZE
        )

    outcomes: dict[str, int] = {}
    for event_id in event_ids:
        outcome = await deliver_one_scan_risk_event(event_id)
        outcomes[outcome.value] = outcomes.get(outcome.value, 0) + 1
        logger.info(
            "scan_risk_dispatch_event_finished",
            event_id=str(event_id),
            outcome=outcome.value,
        )
    unresolved_id_strings = [str(event_id) for event_id in unresolved_ids]
    if unresolved_id_strings:
        logger.warning(
            "scan_risk_dispatch_unresolved_claims",
            event_ids=unresolved_id_strings,
        )
    logger.info(
        "scan_risk_dispatch_batch_finished",
        candidates=len(event_ids),
        outcomes=outcomes,
        unresolved_claims_sample=len(unresolved_ids),
    )
    return {
        "candidates": len(event_ids),
        "outcomes": outcomes,
        "unresolvedClaimIdsSample": unresolved_id_strings,
    }


@celery_app.task(
    name="app.tasks.notification_tasks.dispatch_pending_scan_risk_events",
    max_retries=0,
)
def dispatch_pending_scan_risk_events() -> dict[str, Any]:
    """Run one bounded Beat batch without retrying uncertain deliveries.

    Broker redelivery after a worker crash cannot re-send a claimed event,
    since only pending IDs are selected and every delivery claims atomically.
    Unknown external outcomes are never requeued automatically.
    """
    return asyncio.run(_dispatch_pending_scan_risk_events())


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
