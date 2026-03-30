"""User preferences stored outside core ORM (Redis-backed)."""

from typing import Annotated, Any

from pydantic import BaseModel, BeforeValidator, HttpUrl, field_validator


def _empty_to_none(v: Any) -> Any:
    if v is None:
        return None
    if isinstance(v, str) and not v.strip():
        return None
    return v


class NotificationSettingsResponse(BaseModel):
    webhookUrl: str | None
    webhookEnabled: bool
    monitorEventsEnabled: bool
    emailEnabled: bool
    emailAddress: str | None
    emailOnCritical: bool
    emailOnWarning: bool
    emailOnInfo: bool


class NotificationSettingsUpdate(BaseModel):
    webhookUrl: Annotated[HttpUrl | None, BeforeValidator(_empty_to_none)] = None
    webhookEnabled: bool = False
    monitorEventsEnabled: bool = True
    emailEnabled: bool = False
    emailAddress: Annotated[str | None, BeforeValidator(_empty_to_none)] = None
    emailOnCritical: bool = True
    emailOnWarning: bool = True
    emailOnInfo: bool = False

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
