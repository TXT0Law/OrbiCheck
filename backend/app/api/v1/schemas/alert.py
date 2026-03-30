"""Pydantic schemas for alert event APIs."""

from __future__ import annotations

from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel


class AlertEventResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    capability: str
    event_type: str
    severity: str
    threshold_config: dict[str, Any] = Field(default_factory=dict)
    actual_value: str
    message: str
    dispatched_channels: list[str] = Field(default_factory=list)
    suppressed: bool
    suppress_reason: str | None = None
    created_at: datetime
    resolved_at: datetime | None = None
    acknowledged_at: datetime | None = None
    acknowledged_by: str | None = None
