"""Pydantic schemas for URL Group API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.models.url_group import UrlGroupRunMemberStatus, UrlGroupRunStatus
from app.utils.url_parser import normalize_url


class UrlGroupCreateRequest(BaseModel):
    name: str = Field(..., min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class UrlGroupUpdateRequest(BaseModel):
    name: str | None = Field(None, min_length=1, max_length=255)
    description: str | None = Field(None, max_length=2000)


class UrlGroupMemberAddRequest(BaseModel):
    url: str = Field(..., min_length=1, max_length=2048)
    display_label: str | None = Field(None, max_length=255)

    @field_validator("url")
    @classmethod
    def validate_url(cls, v: str) -> str:
        normalized = normalize_url(v)
        if not normalized:
            raise ValueError("Invalid or empty URL")
        return normalized


class UrlGroupMemberResponse(BaseModel):
    id: str
    url: str
    display_label: str | None
    sort_order: int
    created_at: datetime
    scan_id: str | None = None
    status: str = "incomplete"
    security_score: int | None = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UrlGroupResponse(BaseModel):
    id: str
    name: str
    description: str | None = None
    member_count: int
    created_at: datetime
    updated_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UrlGroupDetailResponse(UrlGroupResponse):
    members: list[UrlGroupMemberResponse] = Field(default_factory=list)


class UrlGroupListResponse(BaseModel):
    groups: list[UrlGroupResponse]
    total: int

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class UrlGroupRunCreateRequest(BaseModel):
    modules: list[str] | None = None
    enable_port_scan: bool = False
    port_scan_profile: str = Field(default="quick", pattern="^(quick|standard|deep)$")
    acknowledge_scan_authorization: bool = False
    concurrency_limit: int | None = Field(default=None, ge=1, le=10)
    skip_recently_scanned_within_seconds: int | None = Field(default=None, ge=1)

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)


class UrlGroupRunMemberResponse(BaseModel):
    id: str
    group_member_id: str
    url: str
    scan_id: str | None = None
    status: UrlGroupRunMemberStatus
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UrlGroupRunResponse(BaseModel):
    id: str
    group_id: str
    user_id: int | None = None
    status: UrlGroupRunStatus
    progress: int
    total_members: int
    queued_members: int
    running_members: int
    completed_members: int
    failed_members: int
    cancelled_members: int
    skipped_members: int
    concurrency_limit: int
    error_message: str | None = None
    created_at: datetime
    started_at: datetime | None = None
    completed_at: datetime | None = None
    members: list[UrlGroupRunMemberResponse] = Field(default_factory=list)

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class UrlGroupRunListResponse(BaseModel):
    runs: list[UrlGroupRunResponse]
    total: int

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)
