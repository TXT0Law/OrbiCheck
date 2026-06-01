import uuid
from datetime import datetime
from typing import Any, Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator
from pydantic.alias_generators import to_camel

from app.models.report import ReportFormat
from app.models.report_schedule import (
    ReportScheduleCadence,
    ReportScheduleRunStatus,
)

REPORT_SCHEDULE_DELIVERY_CHANNELS = ("email", "slack")
REPORT_SCHEDULE_FORMATS = ("pdf", "markdown", "html", "both", "all")
REPORT_SCHEDULE_PERIODS = ("24h", "7d", "30d", "90d")


class ReportScheduleBase(BaseModel):
    name: str = Field(min_length=1, max_length=160)
    scan_id: uuid.UUID
    monitor_id: uuid.UUID | None = None
    monitor_period: Literal["24h", "7d", "30d", "90d"] = "30d"
    format: Literal["pdf", "markdown", "html", "both", "all"] = "pdf"
    cadence: Literal["weekly", "monthly"]
    timezone: str = "UTC"
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    hour: int = Field(ge=0, le=23)
    minute: int = Field(ge=0, le=59)
    delivery_channels: list[Literal["email", "slack"]] = Field(default_factory=list)
    email_recipients: list[str] = Field(default_factory=list, max_length=20)
    is_enabled: bool = True

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str) -> str:
        tz = value.strip()
        if not tz:
            raise ValueError("Timezone is required")
        try:
            ZoneInfo(tz)
        except ZoneInfoNotFoundError as exc:
            raise ValueError("Timezone must be an IANA timezone") from exc
        return tz

    @field_validator("email_recipients")
    @classmethod
    def normalize_email_recipients(cls, value: list[str]) -> list[str]:
        cleaned: list[str] = []
        for raw in value:
            recipient = raw.strip().lower()
            if not recipient:
                continue
            if "@" not in recipient:
                raise ValueError("Email recipients must be valid email addresses")
            if recipient not in cleaned:
                cleaned.append(recipient)
        return cleaned

    @model_validator(mode="after")
    def validate_cadence_fields(self) -> "ReportScheduleBase":
        if self.cadence == "weekly" and self.day_of_week is None:
            raise ValueError("dayOfWeek is required for weekly schedules")
        if self.cadence == "monthly" and self.day_of_month is None:
            raise ValueError("dayOfMonth is required for monthly schedules")
        if "email" in self.delivery_channels and not self.email_recipients:
            raise ValueError("Email recipients are required when email delivery is enabled")
        return self


class ReportScheduleCreateRequest(ReportScheduleBase):
    pass


class ReportScheduleUpdateRequest(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=160)
    scan_id: uuid.UUID | None = None
    monitor_id: uuid.UUID | None = None
    monitor_period: Literal["24h", "7d", "30d", "90d"] | None = None
    format: Literal["pdf", "markdown", "html", "both", "all"] | None = None
    cadence: Literal["weekly", "monthly"] | None = None
    timezone: str | None = None
    day_of_week: int | None = Field(default=None, ge=0, le=6)
    day_of_month: int | None = Field(default=None, ge=1, le=31)
    hour: int | None = Field(default=None, ge=0, le=23)
    minute: int | None = Field(default=None, ge=0, le=59)
    delivery_channels: list[Literal["email", "slack"]] | None = None
    email_recipients: list[str] | None = Field(default=None, max_length=20)
    is_enabled: bool | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    @field_validator("timezone")
    @classmethod
    def validate_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return None
        return ReportScheduleBase.validate_timezone(value)

    @field_validator("email_recipients")
    @classmethod
    def normalize_email_recipients(cls, value: list[str] | None) -> list[str] | None:
        if value is None:
            return None
        return ReportScheduleBase.normalize_email_recipients(value)


class ReportScheduleRunResponse(BaseModel):
    id: uuid.UUID
    schedule_id: uuid.UUID
    report_id: uuid.UUID | None = None
    status: ReportScheduleRunStatus
    started_at: datetime | None = None
    completed_at: datetime | None = None
    error_message: str | None = None
    delivery_summary: dict[str, Any] | None = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ReportScheduleResponse(BaseModel):
    id: uuid.UUID
    user_id: int
    name: str
    scan_id: uuid.UUID | None = None
    monitor_id: uuid.UUID | None = None
    monitor_period: str | None = None
    format: ReportFormat
    cadence: ReportScheduleCadence
    timezone: str
    day_of_week: int | None = None
    day_of_month: int | None = None
    hour: int
    minute: int
    delivery_channels: list[str]
    email_recipients: list[str]
    is_enabled: bool
    last_run_at: datetime | None = None
    next_run_at: datetime | None = None
    created_at: datetime
    updated_at: datetime
    recent_runs: list[ReportScheduleRunResponse] = Field(default_factory=list)

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ReportScheduleListResponse(BaseModel):
    schedules: list[ReportScheduleResponse]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReportScheduleRunsResponse(BaseModel):
    runs: list[ReportScheduleRunResponse]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
