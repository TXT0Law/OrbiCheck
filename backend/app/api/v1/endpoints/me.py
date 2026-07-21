"""Current-user settings (Redis-backed; no separate users table)."""

import uuid
from datetime import datetime, timezone

import aiosmtplib
from fastapi import APIRouter, Depends
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.user_settings import (
    ChannelConfigResponse,
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    NotificationTestRequest,
    NotificationTestResponse,
    TestEmailRequest,
    TestEmailResponse,
)
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user, get_db, get_redis
from app.services.email_service import send_test_email
from app.services.notification_channels.registry import (
    build_alert_payload,
    dispatch_via_channel,
    get_channel,
)
from app.services.notification_test_service import build_synthetic_monitor
from app.services.user_notification_settings import (
    get_notification_settings,
    set_notification_settings,
)

router = APIRouter(prefix="/me", tags=["me"])

PHASE3_CHANNEL_IDS: tuple[str, ...] = ("slack", "discord", "teams", "pagerduty")


def _channels_to_response(raw: dict | None) -> dict[str, ChannelConfigResponse]:
    out: dict[str, ChannelConfigResponse] = {}
    raw = raw if isinstance(raw, dict) else {}
    for cid in PHASE3_CHANNEL_IDS:
        block = raw.get(cid) or {}
        out[cid] = ChannelConfigResponse(
            enabled=bool(block.get("enabled")),
            target=block.get("target"),
            severityFilter=block.get("severityFilter")
            or ["critical", "warning"],
        )
    return out


def _build_response(data: dict) -> NotificationSettingsResponse:
    return NotificationSettingsResponse(
        webhookUrl=data.get("webhookUrl"),
        webhookEnabled=bool(data.get("webhookEnabled")),
        monitorEventsEnabled=bool(data.get("monitorEventsEnabled", True)),
        emailEnabled=bool(data.get("emailEnabled")),
        emailAddress=data.get("emailAddress"),
        emailOnCritical=bool(data.get("emailOnCritical", True)),
        emailOnWarning=bool(data.get("emailOnWarning", True)),
        emailOnInfo=bool(data.get("emailOnInfo", False)),
        channels=_channels_to_response(data.get("channels")),
    )


@router.get(
    "/notification-settings",
    response_model=SuccessResponse[NotificationSettingsResponse],
)
async def read_notification_settings(
    current_user: CurrentUser = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    data = await get_notification_settings(redis, current_user.id)
    return SuccessResponse(data=_build_response(data))


@router.put(
    "/notification-settings",
    response_model=SuccessResponse[NotificationSettingsResponse],
)
async def write_notification_settings(
    body: NotificationSettingsUpdate,
    current_user: CurrentUser = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    url_str = str(body.webhookUrl) if body.webhookUrl else None
    channels_payload = {
        cid: cfg.model_dump() for cid, cfg in body.channels.items()
    }
    saved = await set_notification_settings(
        redis,
        current_user.id,
        {
            "webhookUrl": url_str,
            "webhookEnabled": body.webhookEnabled,
            "monitorEventsEnabled": body.monitorEventsEnabled,
            "emailEnabled": body.emailEnabled,
            "emailAddress": body.emailAddress,
            "emailOnCritical": body.emailOnCritical,
            "emailOnWarning": body.emailOnWarning,
            "emailOnInfo": body.emailOnInfo,
            "channels": channels_payload,
        },
    )
    return SuccessResponse(data=_build_response(saved))


@router.post(
    "/test-email",
    response_model=SuccessResponse[TestEmailResponse],
)
async def send_test_email_endpoint(
    body: TestEmailRequest,
    current_user: CurrentUser = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    """Send a test email to verify SMTP configuration."""
    if not settings.EMAIL_DISPATCH_ENABLED:
        return SuccessResponse(
            data=TestEmailResponse(
                sent=False,
                message="Email dispatch is disabled on the server. Set EMAIL_DISPATCH_ENABLED=true in .env",
            )
        )
    if not settings.SMTP_HOST:
        return SuccessResponse(
            data=TestEmailResponse(
                sent=False,
                message="SMTP_HOST is not configured. Set SMTP credentials in .env",
            )
        )

    to_email = (body.emailAddress or "").strip()
    if not to_email:
        cfg = await get_notification_settings(redis, current_user.id)
        to_email = (cfg.get("emailAddress") or "").strip()

    if not to_email:
        return SuccessResponse(
            data=TestEmailResponse(
                sent=False,
                message="No email address provided. Enter an email address first.",
            )
        )

    try:
        sent = await send_test_email(to_email)
        if sent:
            return SuccessResponse(
                data=TestEmailResponse(
                    sent=True,
                    message=f"Test email sent to {to_email}",
                )
            )
        return SuccessResponse(
            data=TestEmailResponse(
                sent=False,
                message="Email dispatch is disabled on the server.",
            )
        )
    except aiosmtplib.SMTPException as exc:
        _ = exc
        return SuccessResponse(
            data=TestEmailResponse(
                sent=False,
                message="Unable to send test email with the current SMTP configuration.",
            )
        )
    except OSError as exc:
        _ = exc
        return SuccessResponse(
            data=TestEmailResponse(
                sent=False,
                message="Unable to send test email with the current SMTP configuration.",
            )
        )


@router.post(
    "/notification-channels/test",
    response_model=SuccessResponse[NotificationTestResponse],
)
async def send_test_notification(
    body: NotificationTestRequest,
    current_user: CurrentUser = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
    db: AsyncSession = Depends(get_db),
):
    """Phase 3.6: trigger a synthetic alert through the channel adapter.

    The dispatch row is recorded in ``osint_notification_dispatch_log`` like
    a real alert delivery so the audit trail is consistent.
    """

    channel = get_channel(body.channel_id)
    if channel is None:
        return SuccessResponse(
            data=NotificationTestResponse(
                channel_id=body.channel_id,
                success=False,
                message=f"Unknown channel: {body.channel_id}",
                error="UNKNOWN_CHANNEL",
            )
        )

    user_settings = await get_notification_settings(redis, current_user.id)
    synthetic_monitor_id = uuid.uuid4()
    fake_monitor = build_synthetic_monitor(synthetic_monitor_id, current_user.id)
    payload = build_alert_payload(
        monitor=fake_monitor,
        event=None,
        severity="info",
        capability="uptime_only",
        event_type="test_event",
        message="OrbiCheck test alert — channel wiring confirmed.",
        actual_value="test=true",
    )
    payload = payload.model_copy(update={"created_at": datetime.now(timezone.utc)})
    try:
        result = await dispatch_via_channel(
            channel_id=body.channel_id,
            user_id=current_user.id,
            monitor_id=None,
            alert_event_id=None,
            payload=payload,
            user_settings=user_settings,
            db=db,
        )
    except ValueError as exc:
        return SuccessResponse(
            data=NotificationTestResponse(
                channel_id=body.channel_id,
                success=False,
                message=str(exc),
                error="DISPATCH_REJECTED",
            )
        )
    await db.commit()
    if result.success:
        return SuccessResponse(
            data=NotificationTestResponse(
                channel_id=body.channel_id,
                success=True,
                message="Test notification dispatched successfully.",
                latency_ms=result.latency_ms,
                skipped_reason=result.skipped_reason,
            )
        )
    return SuccessResponse(
        data=NotificationTestResponse(
            channel_id=body.channel_id,
            success=False,
            message="Channel dispatch failed — check the channel target.",
            latency_ms=result.latency_ms,
            error=result.error,
        )
    )
