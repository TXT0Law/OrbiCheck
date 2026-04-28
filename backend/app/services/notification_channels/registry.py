"""Single source of truth for the Phase 3 channel adapters.

``alert_service`` and the ``POST /notifications/test`` endpoint both call
:func:`list_channels` instead of branching per channel so adding a new
integration is a one-line registry change.
"""

from __future__ import annotations

import asyncio
import uuid
from typing import Any

import structlog

from app.models.alert_event import AlertEvent
from app.models.monitor import Monitor
from app.services.notification_channels._helpers import render_monitor_link
from app.services.notification_channels.dispatch_log import (
    record_dispatch_attempt,
)
from app.services.notification_channels.discord import DiscordChannel
from app.services.notification_channels.email import EmailChannel
from app.services.notification_channels.pagerduty import (
    PagerDutyChannel,
    PagerDutyEventAction,
)
from app.services.notification_channels.slack import SlackChannel
from app.services.notification_channels.teams import TeamsChannel
from app.services.notification_channels.types import (
    AlertPayload,
    ChannelConfig,
    ChannelDispatchResult,
    NotificationChannel,
)
from app.services.notification_channels.webhook import WebhookChannel

logger = structlog.get_logger(__name__)

_CHANNEL_INSTANCES: dict[str, NotificationChannel] = {
    EmailChannel.channel_id: EmailChannel(),
    WebhookChannel.channel_id: WebhookChannel(),
    SlackChannel.channel_id: SlackChannel(),
    DiscordChannel.channel_id: DiscordChannel(),
    TeamsChannel.channel_id: TeamsChannel(),
    PagerDutyChannel.channel_id: PagerDutyChannel(),
}

CHANNEL_ORDER: tuple[str, ...] = (
    "webhook",
    "email",
    "slack",
    "discord",
    "teams",
    "pagerduty",
)


def list_channels() -> dict[str, NotificationChannel]:
    """Return a snapshot of every registered channel keyed by ``channel_id``."""

    return dict(_CHANNEL_INSTANCES)


def get_channel(channel_id: str) -> NotificationChannel | None:
    return _CHANNEL_INSTANCES.get(channel_id)


def channel_ids() -> tuple[str, ...]:
    """Stable order so the dispatch log / UI sort the channels predictably."""

    return CHANNEL_ORDER


def build_alert_payload(
    *,
    monitor: Monitor,
    event: AlertEvent | None,
    severity: str,
    capability: str,
    event_type: str,
    message: str,
    actual_value: str = "",
    threshold_config: dict[str, Any] | None = None,
    dedup_key: str | None = None,
    pagerduty_event_action: PagerDutyEventAction = PagerDutyEventAction.TRIGGER,
) -> AlertPayload:
    monitor_id = str(monitor.id)
    payload = AlertPayload(
        monitor_id=monitor_id,
        monitor_name=monitor.display_name,
        monitor_url=str(monitor.url),
        capability=capability,
        event_type=event_type,
        severity=severity,  # type: ignore[arg-type]
        message=message,
        actual_value=actual_value,
        threshold_config=threshold_config or {},
        alert_id=str(event.id) if event is not None else None,
        created_at=event.created_at if event is not None else None,
        dedup_key=dedup_key or f"monitor:{monitor_id}:{capability}",
        pagerduty_event_action=pagerduty_event_action,
        monitor_url_dashboard="",
    )
    deep_link = render_monitor_link(payload)
    if deep_link:
        payload = payload.model_copy(update={"monitor_url_dashboard": deep_link})
    return payload


def resolve_channel_configs(
    user_settings: dict[str, Any],
) -> dict[str, ChannelConfig]:
    """Project the per-channel config out of the per-user settings dict.

    Top-level keys remain ``webhookEnabled`` / ``emailEnabled`` etc. for
    backward compat; nested ``channels.{slack|discord|teams|pagerduty}``
    holds the new channel configurations.
    """

    out: dict[str, ChannelConfig] = {}

    out[WebhookChannel.channel_id] = ChannelConfig(
        enabled=bool(user_settings.get("webhookEnabled")),
        target=user_settings.get("webhookUrl"),
        severity_filter=user_settings.get(
            "webhookSeverities",
            ["critical", "warning", "info"],
        ),
    )
    out[EmailChannel.channel_id] = ChannelConfig(
        enabled=bool(user_settings.get("emailEnabled")),
        target=user_settings.get("emailAddress"),
        severity_filter=_email_severity_filter(user_settings),
    )

    nested = user_settings.get("channels")
    if not isinstance(nested, dict):
        nested = {}
    for cid in (
        SlackChannel.channel_id,
        DiscordChannel.channel_id,
        TeamsChannel.channel_id,
        PagerDutyChannel.channel_id,
    ):
        raw = nested.get(cid) if isinstance(nested, dict) else None
        out[cid] = _coerce_channel_config(raw)
    return out


def _coerce_channel_config(raw: Any) -> ChannelConfig:
    if not isinstance(raw, dict):
        return ChannelConfig()
    severity_filter = raw.get("severityFilter")
    if not isinstance(severity_filter, list) or not severity_filter:
        severity_filter = ["critical", "warning"]
    cleaned = [
        s for s in severity_filter if s in ("critical", "warning", "info")
    ] or ["critical", "warning"]
    return ChannelConfig(
        enabled=bool(raw.get("enabled")),
        target=raw.get("target"),
        severity_filter=cleaned,
        options=dict(raw.get("options") or {}),
    )


def _email_severity_filter(user_settings: dict[str, Any]) -> list[str]:
    """Mirror ``_severity_email_enabled`` so existing toggles keep working."""

    out: list[str] = []
    if user_settings.get("emailOnCritical", True):
        out.append("critical")
    if user_settings.get("emailOnWarning", True):
        out.append("warning")
    if user_settings.get("emailOnInfo", False):
        out.append("info")
    if not out:
        out = ["critical"]
    return out


async def dispatch_to_channels(
    *,
    user_id: int,
    monitor: Monitor,
    event: AlertEvent | None,
    payload: AlertPayload,
    user_settings: dict[str, Any],
    db: Any,
) -> dict[str, ChannelDispatchResult]:
    """Dispatch ``payload`` to every channel that opts in for this user.

    Per-channel failures are isolated — one bad webhook never starves the
    others. Each attempt is recorded via ``record_dispatch_attempt`` so the
    retry queue can pick the failed ones up later.
    """

    configs = resolve_channel_configs(user_settings)
    results: dict[str, ChannelDispatchResult] = {}

    async def _dispatch_one(channel_id: str) -> None:
        channel = _CHANNEL_INSTANCES.get(channel_id)
        if channel is None:
            return
        config = configs.get(channel_id) or ChannelConfig()
        try:
            enabled = channel.is_enabled(config, payload)
        except Exception as exc:  # noqa: BLE001 - never trust adapter code
            logger.warning(
                "notification_channel_filter_error",
                channel_id=channel_id,
                error=str(exc)[:200],
            )
            enabled = False
        if not enabled:
            return
        result = await record_dispatch_attempt(
            user_id=user_id,
            monitor_id=monitor.id,
            alert_event_id=event.id if event is not None else None,
            channel_id=channel_id,
            payload=payload,
            send=lambda: channel.send(payload, config),
            db=db,
        )
        results[channel_id] = result

    coros = [_dispatch_one(cid) for cid in CHANNEL_ORDER]
    await asyncio.gather(*coros)
    return results


async def dispatch_via_channel(
    *,
    channel_id: str,
    user_id: int,
    monitor_id: uuid.UUID | None,
    alert_event_id: uuid.UUID | None,
    payload: AlertPayload,
    user_settings: dict[str, Any],
    db: Any,
) -> ChannelDispatchResult:
    """Dispatch through one specific channel — used by the test endpoint."""

    channel = _CHANNEL_INSTANCES.get(channel_id)
    if channel is None:
        raise ValueError(f"Unknown channel: {channel_id}")
    config = resolve_channel_configs(user_settings).get(
        channel_id
    ) or ChannelConfig(enabled=True)
    return await record_dispatch_attempt(
        user_id=user_id,
        monitor_id=monitor_id,
        alert_event_id=alert_event_id,
        channel_id=channel_id,
        payload=payload,
        send=lambda: channel.send(payload, config),
        db=db,
    )
