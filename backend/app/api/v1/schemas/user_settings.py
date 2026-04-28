"""User preferences stored outside core ORM (Redis-backed)."""

from typing import Annotated, Any, Literal

from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, HttpUrl, field_validator

from app.services.notification_channels.discord import (
    validate_target_url as validate_discord_url,
)
from app.services.notification_channels.pagerduty import validate_integration_key
from app.services.notification_channels.slack import (
    validate_target_url as validate_slack_url,
)
from app.services.notification_channels.teams import (
    validate_target_url as validate_teams_url,
)

PHASE3_CHANNEL_IDS: tuple[str, ...] = ("slack", "discord", "teams", "pagerduty")
SeverityLiteral = Literal["critical", "warning", "info"]


def _empty_to_none(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


def _validate_channel_target(channel_id: str, target: str | None) -> str | None:
    """Run the channel-specific URL/integration-key validator at the API edge.

    Returning ``None`` instead of an empty string keeps the Redis store
    consistent with the canonical "missing target" representation.
    """

    if target is None:
        return None
    cleaned = target.strip()
    if not cleaned:
        return None
    if channel_id == "slack":
        return validate_slack_url(cleaned)
    if channel_id == "discord":
        return validate_discord_url(cleaned)
    if channel_id == "teams":
        return validate_teams_url(cleaned)
    if channel_id == "pagerduty":
        return validate_integration_key(cleaned)
    return cleaned


class ChannelConfigRequest(BaseModel):
    """One Slack/Discord/Teams/PagerDuty configuration block."""

    model_config = ConfigDict(extra="forbid")

    enabled: bool = False
    target: str | None = None
    severityFilter: list[SeverityLiteral] = Field(
        default_factory=lambda: ["critical", "warning"]
    )

    @field_validator("severityFilter")
    @classmethod
    def _validate_severity_filter(cls, value: list[str]) -> list[str]:
        if not value:
            return ["critical", "warning"]
        seen: set[str] = set()
        out: list[str] = []
        for item in value:
            if item in seen:
                continue
            seen.add(item)
            out.append(item)
        return out


class ChannelConfigResponse(BaseModel):
    enabled: bool
    target: str | None
    severityFilter: list[SeverityLiteral]


class NotificationSettingsResponse(BaseModel):
    webhookUrl: str | None
    webhookEnabled: bool
    monitorEventsEnabled: bool
    emailEnabled: bool
    emailAddress: str | None
    emailOnCritical: bool
    emailOnWarning: bool
    emailOnInfo: bool
    channels: dict[str, ChannelConfigResponse] = Field(default_factory=dict)


class NotificationSettingsUpdate(BaseModel):
    webhookUrl: Annotated[HttpUrl | None, BeforeValidator(_empty_to_none)] = None
    webhookEnabled: bool = False
    monitorEventsEnabled: bool = True
    emailEnabled: bool = False
    emailAddress: Annotated[str | None, BeforeValidator(_empty_to_none)] = None
    emailOnCritical: bool = True
    emailOnWarning: bool = True
    emailOnInfo: bool = False
    channels: dict[str, ChannelConfigRequest] = Field(default_factory=dict)

    @field_validator("emailAddress")
    @classmethod
    def validate_email_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        email = value.strip()
        if "@" not in email:
            raise ValueError("Value is not a valid email address")
        local, _, domain = email.partition("@")
        if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
            raise ValueError("Value is not a valid email address")
        return email

    @field_validator("channels")
    @classmethod
    def validate_channels(
        cls, value: dict[str, ChannelConfigRequest]
    ) -> dict[str, ChannelConfigRequest]:
        out: dict[str, ChannelConfigRequest] = {}
        for cid, cfg in value.items():
            if cid not in PHASE3_CHANNEL_IDS:
                # Drop unknown channels silently rather than 422-ing — keeps
                # forward compat when the frontend sends extras for a future
                # version of the API.
                continue
            cleaned_target = _validate_channel_target(cid, cfg.target)
            out[cid] = cfg.model_copy(update={"target": cleaned_target})
        return out


class TestEmailRequest(BaseModel):
    emailAddress: Annotated[str | None, BeforeValidator(_empty_to_none)] = None

    @field_validator("emailAddress")
    @classmethod
    def validate_email_address(cls, value: str | None) -> str | None:
        if value is None:
            return None
        email = value.strip()
        if "@" not in email:
            raise ValueError("Value is not a valid email address")
        local, _, domain = email.partition("@")
        if not local or "." not in domain or domain.startswith(".") or domain.endswith("."):
            raise ValueError("Value is not a valid email address")
        return email


class TestEmailResponse(BaseModel):
    sent: bool
    message: str


class NotificationTestRequest(BaseModel):
    """Request body for ``POST /me/notification-channels/test``."""

    model_config = ConfigDict(extra="forbid")

    channel_id: Literal["webhook", "email", "slack", "discord", "teams", "pagerduty"]


class NotificationTestResponse(BaseModel):
    """Single-channel test result surfaced to the frontend."""

    channel_id: str
    success: bool
    message: str
    latency_ms: int | None = None
    error: str | None = None
    skipped_reason: str | None = None
