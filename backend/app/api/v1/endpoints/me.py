"""Current-user settings (Redis-backed; no separate users table)."""

import aiosmtplib
from fastapi import APIRouter, Depends
from redis.asyncio import Redis

from app.api.v1.schemas.common import SuccessResponse
from app.api.v1.schemas.user_settings import (
    NotificationSettingsResponse,
    NotificationSettingsUpdate,
    TestEmailRequest,
    TestEmailResponse,
)
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user, get_redis
from app.services.email_service import send_test_email
from app.services.user_notification_settings import (
    get_notification_settings,
    set_notification_settings,
)

router = APIRouter(prefix="/me", tags=["me"])


@router.get(
    "/notification-settings",
    response_model=SuccessResponse[NotificationSettingsResponse],
)
async def read_notification_settings(
    current_user: CurrentUser = Depends(get_current_user),
    redis: Redis = Depends(get_redis),
):
    data = await get_notification_settings(redis, current_user.id)
    return SuccessResponse(
        data=NotificationSettingsResponse(
            webhookUrl=data.get("webhookUrl"),
            webhookEnabled=bool(data.get("webhookEnabled")),
            monitorEventsEnabled=bool(data.get("monitorEventsEnabled", True)),
            emailEnabled=bool(data.get("emailEnabled")),
            emailAddress=data.get("emailAddress"),
            emailOnCritical=bool(data.get("emailOnCritical", True)),
            emailOnWarning=bool(data.get("emailOnWarning", True)),
            emailOnInfo=bool(data.get("emailOnInfo", False)),
        )
    )


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
        },
    )
    return SuccessResponse(
        data=NotificationSettingsResponse(
            webhookUrl=saved.get("webhookUrl"),
            webhookEnabled=bool(saved.get("webhookEnabled")),
            monitorEventsEnabled=bool(saved.get("monitorEventsEnabled", True)),
            emailEnabled=bool(saved.get("emailEnabled")),
            emailAddress=saved.get("emailAddress"),
            emailOnCritical=bool(saved.get("emailOnCritical", True)),
            emailOnWarning=bool(saved.get("emailOnWarning", True)),
            emailOnInfo=bool(saved.get("emailOnInfo", False)),
        )
    )


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
