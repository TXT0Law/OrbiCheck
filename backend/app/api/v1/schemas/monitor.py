"""Pydantic schemas for monitor API (camelCase in JSON)."""

from __future__ import annotations

import re
from datetime import datetime
from typing import Any, Literal

from pydantic import (
    AliasChoices,
    BaseModel,
    ConfigDict,
    Field,
    HttpUrl,
    field_validator,
    model_validator,
    model_serializer,
)
from pydantic.alias_generators import to_camel

ALLOWED_CAPABILITIES = frozenset({"uptime_only", "content_change", "ssl_expiry", "visual_change"})
QUIET_HOURS_PATTERN = re.compile(r"^\d{2}:\d{2}$")

# 1.1: HTTP request extension limits / policy. Mirrored to the frontend
# in shared/schemas/monitor.ts; if you change a number, update both sides.
ALLOWED_HTTP_METHODS: tuple[str, ...] = (
    "GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS",
)
HTTP_METHODS_WITH_BODY: frozenset[str] = frozenset({"POST", "PUT", "PATCH"})
MAX_REQUEST_BODY_BYTES: int = 64 * 1024
MAX_REQUEST_HEADERS_COUNT: int = 32
MAX_REQUEST_HEADER_NAME_LENGTH: int = 128
MAX_REQUEST_HEADER_VALUE_LENGTH: int = 4096
FORBIDDEN_REQUEST_HEADERS: frozenset[str] = frozenset(
    {
        "host",
        "content-length",
        "transfer-encoding",
        "connection",
        "upgrade",
        "proxy-connection",
        "te",
        "trailer",
    }
)
ALLOWED_HTTP_AUTH_SCHEMES: tuple[str, ...] = ("none", "bearer", "basic")
_HEADER_NAME_PATTERN = re.compile(r"^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$")


def _validate_http_headers(value: dict[str, str] | None) -> dict[str, str] | None:
    """Validate per-monitor extra HTTP headers (count + name + value caps).

    Returns a normalized dict (header names trimmed, values trimmed).
    NEVER passes through forbidden headers (Host, Content-Length, etc.).
    """
    if value is None:
        return None
    if not isinstance(value, dict):
        raise TypeError("httpHeaders must be an object of string -> string")
    if len(value) > MAX_REQUEST_HEADERS_COUNT:
        raise ValueError(
            f"httpHeaders supports at most {MAX_REQUEST_HEADERS_COUNT} entries"
        )
    out: dict[str, str] = {}
    for raw_name, raw_value in value.items():
        if not isinstance(raw_name, str) or not isinstance(raw_value, str):
            raise TypeError("httpHeaders entries must be string -> string")
        name = raw_name.strip()
        if not name:
            raise ValueError("httpHeaders name must be non-empty")
        if len(name) > MAX_REQUEST_HEADER_NAME_LENGTH:
            raise ValueError(
                f"httpHeaders name exceeds {MAX_REQUEST_HEADER_NAME_LENGTH} chars"
            )
        if not _HEADER_NAME_PATTERN.match(name):
            raise ValueError(
                f"httpHeaders name {name!r} contains invalid characters"
            )
        if name.lower() in FORBIDDEN_REQUEST_HEADERS:
            raise ValueError(
                f"httpHeaders cannot override reserved header {name!r}"
            )
        val = raw_value.strip()
        if "\n" in val or "\r" in val:
            raise ValueError("httpHeaders values cannot contain newlines")
        if len(val) > MAX_REQUEST_HEADER_VALUE_LENGTH:
            raise ValueError(
                f"httpHeaders value for {name!r} exceeds "
                f"{MAX_REQUEST_HEADER_VALUE_LENGTH} chars"
            )
        out[name] = val
    return out


def _validate_http_body(value: str | None) -> str | None:
    if value is None:
        return None
    if not isinstance(value, str):
        raise TypeError("httpBody must be a string")
    encoded = value.encode("utf-8")
    if len(encoded) > MAX_REQUEST_BODY_BYTES:
        raise ValueError(
            f"httpBody exceeds {MAX_REQUEST_BODY_BYTES} bytes"
        )
    return value


class HttpAuthInputSchema(BaseModel):
    """Plaintext auth payload accepted on create/update (NEVER stored as-is)."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    scheme: Literal["none", "bearer", "basic"]
    # `none` clears the existing token; bearer/basic carry the secret.
    token: str | None = Field(default=None, max_length=4096)
    # `null` on update means "leave existing token in place"; explicit empty
    # string is rejected to avoid accidentally storing an empty secret.
    @model_validator(mode="after")
    def _check(self) -> "HttpAuthInputSchema":
        if self.scheme == "none":
            object.__setattr__(self, "token", None)
            return self
        if self.token is None:
            return self
        token = self.token
        if "\n" in token or "\r" in token:
            raise ValueError("auth token cannot contain newlines")
        if not token.strip():
            raise ValueError("auth token cannot be blank")
        return self


class HttpAuthSummary(BaseModel):
    """Read-side projection that exposes only whether an auth secret exists."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    scheme: Literal["none", "bearer", "basic"] = "none"
    configured: bool = False


def _normalize_capability_keys(data: Any) -> Any:
    if data is None:
        return data
    if not isinstance(data, dict):
        raise TypeError("capabilities must be an object")
    invalid_keys = []
    normalized: dict[str, Any] = {}
    for raw_key, value in data.items():
        key = str(raw_key).strip().lower().replace("-", "_")
        if key not in ALLOWED_CAPABILITIES:
            invalid_keys.append(str(raw_key))
            continue
        normalized[key] = value
    if invalid_keys:
        invalid = ", ".join(sorted(invalid_keys))
        raise ValueError(f"Invalid capability keys: {invalid}")
    return normalized


class AlertQuietHoursSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    start: str
    end: str

    @field_validator("start", "end")
    @classmethod
    def quiet_hour_format_ok(cls, v: str) -> str:
        if not QUIET_HOURS_PATTERN.match(v):
            raise ValueError("quietHours must use HH:mm format")
        return v


class CapabilityAlertPolicySchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    enabled: bool = True
    cooldown_seconds: int = Field(default=300, ge=0, le=86400)
    quiet_hours: AlertQuietHoursSchema | None = None


class CapabilityAlertPolicyUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    enabled: bool | None = None
    cooldown_seconds: int | None = Field(default=None, ge=0, le=86400)
    quiet_hours: AlertQuietHoursSchema | None = None


class UptimeThresholdsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    max_response_time_ms: int | None = Field(default=5000, ge=100, le=60000)
    consecutive_failures: int = Field(default=3, ge=1, le=100)
    alert_on_unexpected_status: bool = True
    slo_target_percent: float | None = Field(default=99.9, ge=0, le=100)


class UptimeThresholdsUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    max_response_time_ms: int | None = Field(default=None, ge=100, le=60000)
    consecutive_failures: int | None = Field(default=None, ge=1, le=100)
    alert_on_unexpected_status: bool | None = None
    slo_target_percent: float | None = Field(default=None, ge=0, le=100)


class ContentThresholdsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    alert_on_change: bool = True
    min_change_size_bytes: int | None = Field(default=None, ge=0)
    min_total_diff_lines: int | None = Field(default=None, ge=0, le=1_000_000)
    dedup_window_seconds: int | None = Field(default=None, ge=0, le=86400)
    alert_only_medium_or_large: bool | None = None
    alert_only_categories: list[Literal["small", "medium", "large"]] | None = None
    normalize_volatile_tokens: bool | None = True
    suppress_degraded_page_changes: bool | None = True
    selector_extraction: dict[str, Any] | None = None
    normalization_rules: list[dict[str, str]] | None = None
    repeat_alert_max_notifications_per_fingerprint: int | None = Field(
        default=None, ge=1, le=1000
    )
    repeat_alert_fingerprint_window_minutes: int | None = Field(
        default=None, ge=1, le=10080
    )


class ContentThresholdsUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    alert_on_change: bool | None = None
    min_change_size_bytes: int | None = Field(default=None, ge=0)
    min_total_diff_lines: int | None = Field(default=None, ge=0, le=1_000_000)
    dedup_window_seconds: int | None = Field(default=None, ge=0, le=86400)
    alert_only_medium_or_large: bool | None = None
    alert_only_categories: list[Literal["small", "medium", "large"]] | None = None
    normalize_volatile_tokens: bool | None = None
    suppress_degraded_page_changes: bool | None = None
    selector_extraction: dict[str, Any] | None = None
    normalization_rules: list[dict[str, str]] | None = None
    repeat_alert_max_notifications_per_fingerprint: int | None = Field(
        default=None, ge=1, le=1000
    )
    repeat_alert_fingerprint_window_minutes: int | None = Field(
        default=None, ge=1, le=10080
    )


class SslThresholdsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    warn_days_remaining: int = Field(default=30, ge=1, le=365)
    critical_days_remaining: int = Field(default=7, ge=1, le=365)

    @model_validator(mode="after")
    def validate_ssl_threshold_order(self) -> "SslThresholdsSchema":
        if self.warn_days_remaining <= self.critical_days_remaining:
            raise ValueError("warnDaysRemaining must be greater than criticalDaysRemaining")
        return self


class SslThresholdsUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    warn_days_remaining: int | None = Field(default=None, ge=1, le=365)
    critical_days_remaining: int | None = Field(default=None, ge=1, le=365)

    @model_validator(mode="after")
    def validate_ssl_threshold_order(self) -> "SslThresholdsUpdateSchema":
        if (
            self.warn_days_remaining is not None
            and self.critical_days_remaining is not None
            and self.warn_days_remaining <= self.critical_days_remaining
        ):
            raise ValueError("warnDaysRemaining must be greater than criticalDaysRemaining")
        return self


class VisualThresholdsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    similarity_threshold_percent: int | None = Field(default=92, ge=0, le=100)
    viewport_width: int | None = Field(default=1280, ge=320, le=3840)
    viewport_height: int | None = Field(default=720, ge=240, le=2160)
    full_page: bool | None = False
    content_correlation_window_seconds: int | None = Field(default=None, ge=0, le=86400)


class VisualThresholdsUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    similarity_threshold_percent: int | None = Field(default=None, ge=0, le=100)
    viewport_width: int | None = Field(default=None, ge=320, le=3840)
    viewport_height: int | None = Field(default=None, ge=240, le=2160)
    full_page: bool | None = None
    content_correlation_window_seconds: int | None = Field(default=None, ge=0, le=86400)


class PerCapabilityConfigSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    enabled: bool = True
    alert: CapabilityAlertPolicySchema = Field(default_factory=CapabilityAlertPolicySchema)
    thresholds: dict[str, Any] = Field(default_factory=dict)
    interval_override_seconds: int | None = Field(default=None, ge=1, le=86400)


class PerCapabilityConfigUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    enabled: bool | None = None
    alert: CapabilityAlertPolicyUpdateSchema | None = None
    thresholds: dict[str, Any] | None = None
    interval_override_seconds: int | None = Field(default=None, ge=1, le=86400)


class UptimeCapabilityConfigSchema(PerCapabilityConfigSchema):
    thresholds: UptimeThresholdsSchema = Field(default_factory=UptimeThresholdsSchema)


class UptimeCapabilityConfigUpdateSchema(PerCapabilityConfigUpdateSchema):
    thresholds: UptimeThresholdsUpdateSchema | None = None


class ContentCapabilityConfigSchema(PerCapabilityConfigSchema):
    thresholds: ContentThresholdsSchema = Field(default_factory=ContentThresholdsSchema)


class ContentCapabilityConfigUpdateSchema(PerCapabilityConfigUpdateSchema):
    thresholds: ContentThresholdsUpdateSchema | None = None


class SslCapabilityConfigSchema(PerCapabilityConfigSchema):
    thresholds: SslThresholdsSchema = Field(default_factory=SslThresholdsSchema)


class SslCapabilityConfigUpdateSchema(PerCapabilityConfigUpdateSchema):
    thresholds: SslThresholdsUpdateSchema | None = None


class VisualCapabilityConfigSchema(PerCapabilityConfigSchema):
    thresholds: VisualThresholdsSchema = Field(default_factory=VisualThresholdsSchema)


class VisualCapabilityConfigUpdateSchema(PerCapabilityConfigUpdateSchema):
    thresholds: VisualThresholdsUpdateSchema | None = None


class MonitorCapabilitiesSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    uptime_only: UptimeCapabilityConfigSchema
    content_change: ContentCapabilityConfigSchema
    ssl_expiry: SslCapabilityConfigSchema
    visual_change: VisualCapabilityConfigSchema

    @model_validator(mode="before")
    @classmethod
    def validate_capability_keys(cls, data: Any) -> Any:
        return _normalize_capability_keys(data)


class MonitorCapabilitiesPatchSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    uptime_only: UptimeCapabilityConfigUpdateSchema | None = None
    content_change: ContentCapabilityConfigUpdateSchema | None = None
    ssl_expiry: SslCapabilityConfigUpdateSchema | None = None
    visual_change: VisualCapabilityConfigUpdateSchema | None = None

    @model_validator(mode="before")
    @classmethod
    def validate_capability_keys(cls, data: Any) -> Any:
        return _normalize_capability_keys(data)


def dump_capabilities_patch(
    capabilities: MonitorCapabilitiesPatchSchema | None,
) -> dict[str, Any] | None:
    if capabilities is None:
        return None
    out: dict[str, Any] = {}
    for key in ALLOWED_CAPABILITIES:
        value = getattr(capabilities, key, None)
        if value is None:
            continue
        out[key] = value.model_dump(by_alias=True, exclude_unset=True)
    return out


def validate_capabilities_config(raw: dict[str, Any]) -> dict[str, Any]:
    validated = MonitorCapabilitiesSchema.model_validate(raw)
    return {
        key: getattr(validated, key).model_dump(by_alias=True)
        for key in ALLOWED_CAPABILITIES
    }


class MonitorCreateRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    display_name: str = Field(min_length=1, max_length=100)
    url: HttpUrl
    enabled_capabilities: list[str] = Field(
        default_factory=lambda: ["uptime_only"],
        min_length=1,
    )
    capabilities: MonitorCapabilitiesPatchSchema | None = None
    interval_seconds: int = Field(default=300, ge=5, le=3600)
    http_method: str = "GET"
    http_body: str | None = None
    http_headers: dict[str, str] | None = None
    http_auth: HttpAuthInputSchema | None = None
    expected_status_code: int | None = None
    tags: list[str] = Field(default_factory=list)

    @field_validator("enabled_capabilities")
    @classmethod
    def enabled_caps_ok(cls, v: list[str]) -> list[str]:
        if not v:
            raise ValueError("Select at least one capability")
        for x in v:
            if x not in ALLOWED_CAPABILITIES:
                raise ValueError(f"Invalid capability: {x}")
        return v

    @field_validator("interval_seconds")
    @classmethod
    def interval_ok(cls, v: int) -> int:
        if v < 5 or v > 3600:
            raise ValueError("interval_seconds must be between 5 and 3600")
        return v

    @field_validator("http_method")
    @classmethod
    def method_ok(cls, v: str) -> str:
        u = v.upper()
        if u not in ALLOWED_HTTP_METHODS:
            raise ValueError(f"Invalid HTTP method: {v}")
        return u

    @field_validator("http_body")
    @classmethod
    def body_ok(cls, v: str | None) -> str | None:
        return _validate_http_body(v)

    @field_validator("http_headers")
    @classmethod
    def headers_ok(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        return _validate_http_headers(v)

    @model_validator(mode="after")
    def body_only_for_method_with_body(self) -> "MonitorCreateRequest":
        if self.http_body and self.http_method not in HTTP_METHODS_WITH_BODY:
            raise ValueError(
                f"httpBody not allowed for method {self.http_method}"
            )
        return self

    @field_validator("tags")
    @classmethod
    def tags_ok(cls, v: list[str]) -> list[str]:
        if len(v) > 10:
            raise ValueError("Too many tags")
        for t in v:
            if len(t) > 50:
                raise ValueError("Tag too long")
        return v


class MonitorUpdateRequest(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    display_name: str | None = Field(default=None, min_length=1, max_length=100)
    url: HttpUrl | None = None
    enabled_capabilities: list[str] | None = None
    capabilities: MonitorCapabilitiesPatchSchema | None = None
    interval_seconds: int | None = None
    http_method: str | None = None
    http_body: str | None = None
    http_headers: dict[str, str] | None = None
    http_auth: HttpAuthInputSchema | None = None
    # Set to True to clear http_body / http_headers / http_auth on update.
    clear_http_body: bool = False
    clear_http_headers: bool = False
    expected_status_code: int | None = None
    is_enabled: bool | None = None
    tags: list[str] | None = None

    @field_validator("enabled_capabilities")
    @classmethod
    def enabled_caps_ok(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if not v:
            raise ValueError("Select at least one capability")
        for x in v:
            if x not in ALLOWED_CAPABILITIES:
                raise ValueError(f"Invalid capability: {x}")
        return v

    @field_validator("interval_seconds")
    @classmethod
    def interval_ok(cls, v: int | None) -> int | None:
        if v is None:
            return v
        if v < 5 or v > 3600:
            raise ValueError("interval_seconds must be between 5 and 3600")
        return v

    @field_validator("http_method")
    @classmethod
    def method_ok(cls, v: str | None) -> str | None:
        if v is None:
            return v
        u = v.upper()
        if u not in ALLOWED_HTTP_METHODS:
            raise ValueError(f"Invalid HTTP method: {v}")
        return u

    @field_validator("http_body")
    @classmethod
    def body_ok(cls, v: str | None) -> str | None:
        return _validate_http_body(v)

    @field_validator("http_headers")
    @classmethod
    def headers_ok(cls, v: dict[str, str] | None) -> dict[str, str] | None:
        return _validate_http_headers(v)

    @field_validator("tags")
    @classmethod
    def tags_ok(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        if len(v) > 10:
            raise ValueError("Too many tags")
        for t in v:
            if len(t) > 50:
                raise ValueError("Tag too long")
        return v


class CapabilityStatusSummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    capability: str
    status: str
    last_check_at: datetime | None = None
    last_value: str | None = None
    summary: str | None = None


class MonitorResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    display_name: str
    url: str
    enabled_capabilities: list[str]
    capabilities: dict[str, Any]
    capability_statuses: list[CapabilityStatusSummary]
    interval_seconds: int
    http_method: str
    http_body: str | None = None
    http_headers: dict[str, str] | None = None
    http_auth: HttpAuthSummary = Field(default_factory=HttpAuthSummary)
    expected_status_code: int | None
    is_enabled: bool
    status: str
    last_check_at: datetime | None
    last_status_code: int | None
    last_response_time_ms: float | None
    last_change_detected_at: datetime | None
    ssl_expiry_days: int | None
    total_checks: int
    consecutive_failures: int
    uptime_percentage: float | None
    avg_response_time_ms: float | None
    last_success: bool | None = None
    tags: list[str]
    created_at: datetime
    updated_at: datetime


class MonitorCheckResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    checked_at: datetime
    success: bool
    status_code: int | None
    response_time_ms: float
    error_type: str | None
    error_message: str | None
    content_hash: str | None
    content_changed: bool
    snapshot_id: str | None
    ssl_days_remaining: int | None
    evaluated_capabilities: list[str]


class MonitorChangeResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    detected_at: datetime
    previous_snapshot_id: str | None = Field(
        default=None,
        serialization_alias="snapshotBeforeId",
        validation_alias=AliasChoices(
            "previous_snapshot_id",
            "snapshotBeforeId",
        ),
    )
    current_snapshot_id: str | None = Field(
        default=None,
        serialization_alias="snapshotAfterId",
        validation_alias=AliasChoices(
            "current_snapshot_id",
            "snapshotAfterId",
        ),
    )
    diff_summary: dict[str, int | str]
    change_size_bytes: int = 0
    previous_hash: str | None = None
    current_hash: str | None = None
    linked_visual_capture_id: str | None = None
    linked_visual_correlation: Literal["check_id", "time_window"] | None = None


class MonitorDiffResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    change_id: str
    previous_content: str
    current_content: str
    diff_html: str
    unified_diff: str = ""
    truncated: bool = False
    previous_content_length: int = 0
    current_content_length: int = 0
    max_display_length: int = 0
    previous_captured_at: datetime | None = None
    current_captured_at: datetime | None = None
    diff_summary: dict[str, int | str] = Field(default_factory=dict)
    original_previous_length: int = 0
    original_current_length: int = 0
    linked_visual_capture_id: str | None = None
    linked_visual_correlation: Literal["check_id", "time_window"] | None = None


class MonitorVisualCaptureResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    check_id: str | None = None
    captured_at: datetime
    width_px: int
    height_px: int
    viewport_width: int
    viewport_height: int
    full_page: bool
    perceptual_hash_hex: str | None = None
    dhash_algo: str = "dhash"


class MonitorVisualChangeResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    detected_at: datetime
    previous_capture_id: str
    current_capture_id: str
    diff_summary: dict[str, Any]


class MonitorBaselineResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    snapshot_id: str
    captured_at: datetime
    content_hash: str
    content_size_bytes: int
    content_type: str | None = None
    charset: str | None = None
    http_status_code: int | None = None
    is_baseline: bool = False


class MonitorTimeSeriesBucket(BaseModel):
    """Single aggregated bucket for charting (not raw probe rows)."""

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    timestamp: datetime
    success_rate: float
    avg_response_time: float
    min_response_time: float
    max_response_time: float
    check_count: int


class MonitorTimeSeriesData(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    period: str
    resolution: str
    points: list[MonitorTimeSeriesBucket]


class MonitorCurrentStreak(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    status: str
    since: datetime
    duration_seconds: int


class MonitorFailureDistribution(BaseModel):
    """Fixed uppercase keys in JSON (not camelCase) for chart labels."""

    model_config = ConfigDict(populate_by_name=True)

    TIMEOUT: int = 0
    DNS: int = 0
    CONNECTION: int = 0
    SSL: int = 0
    HTTP_ERROR: int = 0
    UNKNOWN: int = 0

    @model_serializer(mode="plain")
    def serialize_upper(self) -> dict[str, int]:
        return {
            "TIMEOUT": self.TIMEOUT,
            "DNS": self.DNS,
            "CONNECTION": self.CONNECTION,
            "SSL": self.SSL,
            "HTTP_ERROR": self.HTTP_ERROR,
            "UNKNOWN": self.UNKNOWN,
        }


class MonitorUptimeSummaryResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    period: str
    total_checks: int
    successful_checks: int
    failed_checks: int
    uptime_percentage: float
    avg_response_time_ms: float
    p95_response_time_ms: float
    incidents: int
    current_streak: MonitorCurrentStreak | None = None
    failure_distribution: MonitorFailureDistribution


class ChainEntrySummary(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    subject_dn: str = ""
    issuer_dn: str = ""
    valid_from: str = ""
    valid_to: str = ""
    sha256_fingerprint: str = ""
    position: int = 0
    is_leaf: bool = False


class MonitorSslStatusResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    days_remaining: int | None = None
    expiry_date: str | None = None
    issuer: str | None = None
    subject: str | None = None
    is_valid: bool = False
    severity_level: str = "unknown"
    is_expiring_soon: bool = False
    is_expired: bool = False
    subject_alternative_names: list[str] = Field(default_factory=list)
    chain_summary: list[ChainEntrySummary] = Field(default_factory=list)
    last_checked_at: datetime | None = None
    serial_number: str | None = None
    signature_algorithm: str | None = None
    sha256_fingerprint: str | None = None
    error: str | None = None
    # Legacy aliases for older clients (same data as subject / not_before / not_after)
    valid_from: str = ""
    valid_to: str = ""

# ── Phase 1.2: bulk operations ────────────────────────────────────────
BULK_ACTIONS: tuple[str, ...] = ("pause", "resume", "enable", "disable", "delete")
MAX_BULK_MONITOR_IDS: int = 100


class MonitorBulkActionRequest(BaseModel):
    """Apply ``action`` to up to ``MAX_BULK_MONITOR_IDS`` monitors at once."""

    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    action: Literal["pause", "resume", "enable", "disable", "delete"]
    monitor_ids: list[str] = Field(min_length=1, max_length=MAX_BULK_MONITOR_IDS)

    @field_validator("monitor_ids")
    @classmethod
    def _ids_unique(cls, v: list[str]) -> list[str]:
        seen: set[str] = set()
        out: list[str] = []
        for raw in v:
            mid = (raw or "").strip()
            if not mid or mid in seen:
                continue
            seen.add(mid)
            out.append(mid)
        if not out:
            raise ValueError("monitorIds must contain at least one non-empty id")
        return out


class MonitorBulkActionFailure(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True
    )

    monitor_id: str
    error_code: str
    message: str


class MonitorBulkActionResponse(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True
    )

    action: Literal["pause", "resume", "enable", "disable", "delete"]
    succeeded: list[str] = Field(default_factory=list)
    failed: list[MonitorBulkActionFailure] = Field(default_factory=list)
    requested: int = 0
