"""Pydantic schemas for URL Group API."""

from datetime import datetime

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

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
