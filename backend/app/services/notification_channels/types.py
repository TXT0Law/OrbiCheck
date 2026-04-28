"""Shared types for the Phase 3 notification channel framework.

Kept in a dedicated module so individual channel adapters (``slack.py`` etc.)
can import without triggering a circular import through the registry.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from enum import Enum
from typing import Any, Literal, Protocol

from pydantic import BaseModel, ConfigDict, Field

ALERT_EVENT_TYPE = "alert_event"

ChannelStatus = Literal["pending", "succeeded", "failed", "dead"]
SeverityLevel = Literal["critical", "warning", "info"]


class PagerDutyEventAction(str, Enum):
    """Map directly to PagerDuty Events API v2 ``event_action`` values."""

    TRIGGER = "trigger"
    ACKNOWLEDGE = "acknowledge"
    RESOLVE = "resolve"


class AlertPayload(BaseModel):
    """Channel-agnostic envelope sent to every outbound integration.

    Severity ``critical | warning | info`` follows the existing
    ``alert_event.severity`` taxonomy. ``actual_value`` mirrors what the
    DB stores so the channel formatter can render it without re-deriving.
    """

    model_config = ConfigDict(frozen=True)

    monitor_id: str
    monitor_name: str
    monitor_url: str
    capability: str
    event_type: str = ALERT_EVENT_TYPE
    severity: SeverityLevel
    message: str
    actual_value: str = ""
    threshold_config: dict[str, Any] = Field(default_factory=dict)
    alert_id: str | None = None
    created_at: datetime | None = None
    # Stable key used by PagerDuty (and future de-dupe channels) so a
    # ``trigger`` followed by ``resolve`` collapse into one incident.
    dedup_key: str | None = None
    # PagerDuty needs to know whether this is a trigger or a resolve so the
    # adapter can short-circuit when the event is not relevant to itself.
    pagerduty_event_action: PagerDutyEventAction = PagerDutyEventAction.TRIGGER
    # Deep-link rendered in card footers / "View incident" buttons.
    monitor_url_dashboard: str = ""


class ChannelConfig(BaseModel):
    """Per-user, per-channel configuration loaded from Redis.

    Stored under the existing ``notification_settings`` Redis key as a nested
    ``channels.{channel_id}`` object — see ``user_notification_settings``.
    Free-form ``options`` exists so adapters can carry small per-channel
    extras (e.g. PagerDuty integration key) without bloating the top-level
    schema.
    """

    model_config = ConfigDict(extra="ignore")

    enabled: bool = False
    target: str | None = None
    severity_filter: list[SeverityLevel] = Field(
        default_factory=lambda: ["critical", "warning"]
    )
    options: dict[str, Any] = Field(default_factory=dict)


class ChannelDispatchResult(BaseModel):
    """Per-attempt outcome surfaced to the retry queue / dispatch log."""

    model_config = ConfigDict(frozen=True)

    success: bool
    error: str | None = None
    latency_ms: int | None = None
    attempt: int = 1
    dispatch_log_id: uuid.UUID | None = None
    skipped_reason: str | None = None


class NotificationChannel(Protocol):
    """Static structural type all adapters must satisfy.

    Implemented by ``WebhookChannel``, ``EmailChannel``, ``SlackChannel``,
    ``DiscordChannel``, ``TeamsChannel``, and ``PagerDutyChannel``.
    """

    channel_id: str

    def is_enabled(self, config: ChannelConfig, payload: AlertPayload) -> bool:
        """Return True if this channel should receive ``payload``.

        Channel-specific filters (severity allow-list, "URL configured", etc.)
        live here — never inside the registry — so we never mix channel logic
        with dispatch orchestration.
        """

    async def send(
        self,
        payload: AlertPayload,
        config: ChannelConfig,
    ) -> ChannelDispatchResult:
        """Best-effort delivery; raises only on programmer errors."""
