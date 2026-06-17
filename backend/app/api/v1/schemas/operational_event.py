import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, ConfigDict
from pydantic.alias_generators import to_camel


class OperationalEventResponse(BaseModel):
    id: uuid.UUID
    user_id: int | None = None
    event_type: str
    status: str
    target_url: str | None = None
    scan_id: uuid.UUID | None = None
    monitor_id: uuid.UUID | None = None
    report_id: uuid.UUID | None = None
    group_id: uuid.UUID | None = None
    group_run_id: uuid.UUID | None = None
    group_run_member_id: uuid.UUID | None = None
    duration_ms: int | None = None
    retry_count: int = 0
    error_code: str | None = None
    message: str | None = None
    trace_id: str | None = None
    details: dict[str, Any] | list[Any] | None = None
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class OperationalEventListResponse(BaseModel):
    events: list[OperationalEventResponse]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
