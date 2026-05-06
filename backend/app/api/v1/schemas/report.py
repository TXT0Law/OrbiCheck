import uuid
from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field
from pydantic.alias_generators import to_camel

from app.models.report import ReportFormat, ReportStatus

REPORT_PERIODS = ("24h", "7d", "30d", "90d")


class ReportCreateRequest(BaseModel):
    scan_id: uuid.UUID
    monitor_id: uuid.UUID | None = None
    monitor_period: Literal["24h", "7d", "30d", "90d"] = "30d"
    format: Literal["pdf", "markdown", "html", "both", "all"] = "pdf"
    title: str | None = Field(default=None, max_length=512)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReportResponse(BaseModel):
    id: uuid.UUID
    title: str
    format: ReportFormat
    status: ReportStatus
    scan_id: uuid.UUID | None = None
    monitor_id: uuid.UUID | None = None
    monitor_period: str | None = None
    file_size_bytes: int | None = None
    error_message: str | None = None
    report_meta: dict[str, Any] | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ReportListItem(BaseModel):
    id: uuid.UUID
    title: str
    format: ReportFormat
    status: ReportStatus
    # Scan id is included so the dashboard can deep-link from a report row
    # into the scan-to-scan diff page (Phase 5 / T5.2). May be null when the
    # underlying scan has been deleted (FK is set to NULL on cascade).
    scan_id: uuid.UUID | None = None
    scan_domain: str | None = None
    file_size_bytes: int | None = None
    created_at: datetime
    completed_at: datetime | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReportPreviewResponse(BaseModel):
    id: uuid.UUID
    title: str
    status: ReportStatus
    content_md: str
    report_meta: dict[str, Any] | None = None

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class ReportListResponse(BaseModel):
    reports: list[ReportListItem]

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
