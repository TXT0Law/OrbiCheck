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

ALLOWED_CAPABILITIES = frozenset(
    {
        "uptime_only",
        "content_change",
        "ssl_expiry",
        "visual_change",
        "dns_change",
        "ct_log",
    }
)
QUIET_HOURS_PATTERN = re.compile(r"^\d{2}:\d{2}$")
# Phase 2.2 / 2.3 limits — kept here so the backend stays the source of truth.
DNS_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME", "MX", "NS", "TXT", "CAA")
DEFAULT_DNS_RECORD_TYPES: tuple[str, ...] = ("A", "AAAA", "CNAME")
MAX_DNS_NAMESERVERS: int = 8
MAX_CT_PINNED_SERIALS: int = 32
# crt.sh exposes certificate serial numbers (variable length hex, RFC 5280 caps
# them at 20 octets / 40 hex chars). We allow up to 64 hex chars to be lenient.
CT_PIN_SERIAL_PATTERN = re.compile(r"^[a-fA-F0-9]{1,64}$")
IP_ADDRESS_PATTERN = re.compile(
    r"^(?:[0-9]{1,3}(?:\.[0-9]{1,3}){3}|[0-9A-Fa-f:]+)$"
)

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


class ContentFetchOptionsSchema(BaseModel):
    """C-5: per-monitor knobs forwarded to ``page-source-rendered`` (browser fetch).

    All fields are optional — ``content_rendered_fetch.get_rendered_fetch_options``
    treats absent values as "use the scan-service defaults". Numbers are bounded
    here so a malicious / mistaken config can never request a 5-minute
    ``waitMs`` or a 10000×10000 viewport.
    """

    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    wait_for_selector: str | None = Field(default=None, max_length=500)
    wait_ms: int | None = Field(default=None, ge=0, le=10_000)
    viewport_width: int | None = Field(default=None, ge=320, le=3840)
    viewport_height: int | None = Field(default=None, ge=240, le=2160)


class ContentExtractorSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    type: Literal["css", "xpath", "jsonpath"]
    expression: str = Field(min_length=1, max_length=500)


class ContentRestockSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    enabled: bool = False
    out_of_stock_keywords: list[str] = Field(default_factory=list, max_length=32)
    in_stock_keywords: list[str] = Field(default_factory=list, max_length=32)

    @field_validator("out_of_stock_keywords", "in_stock_keywords")
    @classmethod
    def _restock_words_ok(cls, v: list[str]) -> list[str]:
        return _validate_trigger_words(v) or []


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
    extractors: list[ContentExtractorSchema] | None = None
    restock: ContentRestockSchema | None = None
    normalization_rules: list[dict[str, str]] | None = None
    repeat_alert_max_notifications_per_fingerprint: int | None = Field(
        default=None, ge=1, le=1000
    )
    repeat_alert_fingerprint_window_minutes: int | None = Field(
        default=None, ge=1, le=10080
    )
    # C-3: notification triggers — see content_trigger_helpers.
    trigger_words: list[str] | None = None
    ignore_words: list[str] | None = None
    trigger_regex: str | None = None
    # C-5: rendered-DOM fetch toggle. The Pydantic schema uses extra="forbid"
    # so the legacy frontend that omitted these keys must remain valid; defaulting
    # to "http" means existing monitors keep their cheap HTTP fetch path until
    # the operator explicitly opts in.
    fetch_mode: Literal["http", "browser"] | None = "http"
    fetch_options: ContentFetchOptionsSchema | None = None

    @field_validator("trigger_words", "ignore_words")
    @classmethod
    def _trigger_words_ok(cls, v: list[str] | None) -> list[str] | None:
        return _validate_trigger_words(v)

    @field_validator("trigger_regex")
    @classmethod
    def _trigger_regex_ok(cls, v: str | None) -> str | None:
        return _validate_trigger_regex(v)


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
    extractors: list[ContentExtractorSchema] | None = None
    restock: ContentRestockSchema | None = None
    normalization_rules: list[dict[str, str]] | None = None
    repeat_alert_max_notifications_per_fingerprint: int | None = Field(
        default=None, ge=1, le=1000
    )
    repeat_alert_fingerprint_window_minutes: int | None = Field(
        default=None, ge=1, le=10080
    )
    trigger_words: list[str] | None = None
    ignore_words: list[str] | None = None
    trigger_regex: str | None = None
    fetch_mode: Literal["http", "browser"] | None = None
    fetch_options: ContentFetchOptionsSchema | None = None

    @field_validator("trigger_words", "ignore_words")
    @classmethod
    def _trigger_words_ok(cls, v: list[str] | None) -> list[str] | None:
        return _validate_trigger_words(v)

    @field_validator("trigger_regex")
    @classmethod
    def _trigger_regex_ok(cls, v: str | None) -> str | None:
        return _validate_trigger_regex(v)


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


class VisualWaitForSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    selector: str | None = Field(default=None, max_length=500)
    timeout_ms: int | None = Field(default=None, ge=0, le=10_000)


class VisualBrowserStepSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    action: Literal["goto", "wait", "scroll", "click", "type"]
    url: HttpUrl | None = None
    ms: int | None = Field(default=None, ge=0, le=10_000)
    selector: str | None = Field(default=None, max_length=500)
    value: str | None = Field(default=None, max_length=500)

    @model_validator(mode="after")
    def required_fields_for_action(self) -> "VisualBrowserStepSchema":
        if self.action == "goto" and self.url is None:
            raise ValueError("goto step requires url")
        if self.action == "wait" and self.ms is None:
            raise ValueError("wait step requires ms")
        if self.action in {"click", "type"} and not self.selector:
            raise ValueError(f"{self.action} step requires selector")
        if self.action == "type" and self.value is None:
            raise ValueError("type step requires value")
        if self.action != "goto" and self.url is not None:
            raise ValueError("url is only valid for goto steps")
        if self.action != "wait" and self.ms is not None:
            raise ValueError("ms is only valid for wait steps")
        if self.action not in {"click", "type"} and self.selector is not None:
            raise ValueError("selector is only valid for click/type steps")
        if self.action != "type" and self.value is not None:
            raise ValueError("value is only valid for type steps")
        return self


class VisualThresholdsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    similarity_threshold_percent: int | None = Field(default=92, ge=0, le=100)
    viewport_width: int | None = Field(default=1280, ge=320, le=3840)
    viewport_height: int | None = Field(default=720, ge=240, le=2160)
    full_page: bool | None = False
    content_correlation_window_seconds: int | None = Field(default=None, ge=0, le=86400)
    # V-1: keep True so failed-probe screenshots are stored as diagnostics.
    capture_on_failure: bool | None = True
    # V-10: which perceptual hash algorithm to compute on each capture.
    hash_algorithm: Literal["dhash", "phash", "ahash", "whash"] | None = "dhash"
    # V-11: ignore-region rectangles (percent coords). Mask is applied
    # before hashing so dynamic widgets don't trip the threshold.
    ignore_regions: list[dict[str, Any]] | None = None
    wait_for: VisualWaitForSchema | None = None
    steps: list[VisualBrowserStepSchema] | None = Field(default=None, max_length=8)

    @field_validator("ignore_regions")
    @classmethod
    def _ignore_regions_ok(
        cls, v: list[dict[str, Any]] | None
    ) -> list[dict[str, Any]] | None:
        return _validate_ignore_regions(v)


class VisualThresholdsUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    similarity_threshold_percent: int | None = Field(default=None, ge=0, le=100)
    viewport_width: int | None = Field(default=None, ge=320, le=3840)
    viewport_height: int | None = Field(default=None, ge=240, le=2160)
    full_page: bool | None = None
    content_correlation_window_seconds: int | None = Field(default=None, ge=0, le=86400)
    capture_on_failure: bool | None = None
    hash_algorithm: Literal["dhash", "phash", "ahash", "whash"] | None = None
    ignore_regions: list[dict[str, Any]] | None = None
    wait_for: VisualWaitForSchema | None = None
    steps: list[VisualBrowserStepSchema] | None = Field(default=None, max_length=8)

    @field_validator("ignore_regions")
    @classmethod
    def _ignore_regions_ok(
        cls, v: list[dict[str, Any]] | None
    ) -> list[dict[str, Any]] | None:
        return _validate_ignore_regions(v)


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


def _validate_dns_record_types(value: list[str]) -> list[str]:
    if not value:
        raise ValueError("recordTypes must include at least one entry")
    if len(value) > len(DNS_RECORD_TYPES):
        raise ValueError("Too many DNS record types")
    seen: list[str] = []
    for raw in value:
        if not isinstance(raw, str):
            raise TypeError("recordTypes entries must be strings")
        upper = raw.strip().upper()
        if upper not in DNS_RECORD_TYPES:
            raise ValueError(f"Unsupported DNS record type: {raw}")
        if upper not in seen:
            seen.append(upper)
    return seen


def _validate_nameservers(value: list[str]) -> list[str]:
    if len(value) > MAX_DNS_NAMESERVERS:
        raise ValueError(
            f"nameservers supports at most {MAX_DNS_NAMESERVERS} entries"
        )
    out: list[str] = []
    for raw in value:
        if not isinstance(raw, str):
            raise TypeError("nameservers entries must be strings")
        ns = raw.strip()
        if not ns:
            continue
        if not IP_ADDRESS_PATTERN.match(ns):
            raise ValueError(f"Invalid nameserver address: {raw}")
        if ns not in out:
            out.append(ns)
    return out


# C-3 / V-11: shared limits — keep aligned with backend helper modules
# (`content_trigger_helpers.MAX_*`, `visual_change_helpers.MAX_IGNORE_REGIONS`).
# Defined here so the API rejects bad input with HTTP 422 *before* it ever
# reaches the live probe path.
MAX_TRIGGER_WORDS_PER_LIST = 32
MAX_TRIGGER_WORD_LENGTH = 200
MAX_TRIGGER_REGEX_LENGTH = 500
MAX_VISUAL_IGNORE_REGIONS = 8

# C-5 / B-7: browser fetch mode spins up Playwright on every check, so the
# minimum interval is enforced at the API boundary to prevent a 60s monitor
# from saturating the shared Chromium pool.
MIN_BROWSER_FETCH_INTERVAL_SECONDS = 300


def _content_change_fetch_mode(
    capabilities_patch: Any,
) -> str | None:
    """Extract content_change.thresholds.fetchMode from a capabilities patch.

    Accepts both the create-time ``MonitorCapabilitiesPatchSchema`` (already
    parsed) and a raw dict (from update flows that bypass the patch model).
    Returns the lowercase fetch mode or ``None`` when not set.
    """
    if capabilities_patch is None:
        return None
    content = getattr(capabilities_patch, "content_change", None)
    if content is None and isinstance(capabilities_patch, dict):
        content = capabilities_patch.get("content_change")
    if content is None:
        return None
    thresholds = getattr(content, "thresholds", None)
    if thresholds is None and isinstance(content, dict):
        thresholds = content.get("thresholds")
    if thresholds is None:
        return None
    raw_mode = getattr(thresholds, "fetch_mode", None)
    if raw_mode is None and isinstance(thresholds, dict):
        raw_mode = thresholds.get("fetchMode") or thresholds.get("fetch_mode")
    if not isinstance(raw_mode, str):
        return None
    return raw_mode.lower()


def _validate_trigger_words(value: list[str] | None) -> list[str] | None:
    if value is None:
        return value
    if len(value) > MAX_TRIGGER_WORDS_PER_LIST:
        raise ValueError(
            f"At most {MAX_TRIGGER_WORDS_PER_LIST} trigger / ignore words"
        )
    out: list[str] = []
    for raw in value:
        if not isinstance(raw, str):
            raise TypeError("trigger / ignore word entries must be strings")
        cleaned = raw.strip()
        if not cleaned:
            continue
        if len(cleaned) > MAX_TRIGGER_WORD_LENGTH:
            raise ValueError(
                f"trigger / ignore word exceeds {MAX_TRIGGER_WORD_LENGTH} chars"
            )
        out.append(cleaned)
    return out


def _validate_trigger_regex(value: str | None) -> str | None:
    if value is None:
        return value
    cleaned = value.strip()
    if not cleaned:
        return None
    if len(cleaned) > MAX_TRIGGER_REGEX_LENGTH:
        raise ValueError(
            f"triggerRegex exceeds {MAX_TRIGGER_REGEX_LENGTH} chars"
        )
    try:
        re.compile(cleaned)
    except re.error as exc:
        raise ValueError(f"Invalid triggerRegex: {exc}") from exc
    return cleaned


def _validate_ignore_regions(
    value: list[dict[str, Any]] | None,
) -> list[dict[str, Any]] | None:
    if value is None:
        return value
    if len(value) > MAX_VISUAL_IGNORE_REGIONS:
        raise ValueError(
            f"At most {MAX_VISUAL_IGNORE_REGIONS} ignore regions"
        )
    out: list[dict[str, Any]] = []
    for raw in value:
        if not isinstance(raw, dict):
            raise TypeError("ignoreRegions entries must be objects")
        try:
            x = float(raw.get("x", 0.0))
            y = float(raw.get("y", 0.0))
            w = float(raw.get("width", 0.0))
            h = float(raw.get("height", 0.0))
        except (TypeError, ValueError) as exc:
            raise ValueError(f"ignoreRegions geometry must be numeric: {exc}") from exc
        for label, coord in (("x", x), ("y", y), ("width", w), ("height", h)):
            if coord < 0 or coord > 100:
                raise ValueError(
                    f"ignoreRegions {label} must be within 0..100 (got {coord})"
                )
        if w <= 0 or h <= 0:
            # Drop zero-area regions silently — the editor sometimes emits
            # them mid-drag and they would otherwise just waste config space.
            continue
        out.append({"x": x, "y": y, "width": w, "height": h})
    return out


def _validate_pinned_serials(value: list[str]) -> list[str]:
    if len(value) > MAX_CT_PINNED_SERIALS:
        raise ValueError(
            f"pinnedSerials supports at most {MAX_CT_PINNED_SERIALS} entries"
        )
    out: list[str] = []
    for raw in value:
        if not isinstance(raw, str):
            raise TypeError("pinnedSerials entries must be strings")
        norm = raw.strip().lower().replace(":", "")
        if not CT_PIN_SERIAL_PATTERN.match(norm):
            raise ValueError(f"Invalid certificate serial number: {raw}")
        if norm not in out:
            out.append(norm)
    return out


class DnsThresholdsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    record_types: list[str] = Field(default_factory=lambda: list(DEFAULT_DNS_RECORD_TYPES))
    nameservers: list[str] = Field(default_factory=list)
    query_timeout_seconds: int = Field(default=5, ge=1, le=60)
    alert_on_change: bool = True

    @field_validator("record_types")
    @classmethod
    def record_types_ok(cls, v: list[str]) -> list[str]:
        return _validate_dns_record_types(v)

    @field_validator("nameservers")
    @classmethod
    def nameservers_ok(cls, v: list[str]) -> list[str]:
        return _validate_nameservers(v)


class DnsThresholdsUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    record_types: list[str] | None = None
    nameservers: list[str] | None = None
    query_timeout_seconds: int | None = Field(default=None, ge=1, le=60)
    alert_on_change: bool | None = None

    @field_validator("record_types")
    @classmethod
    def record_types_ok(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        return _validate_dns_record_types(v)

    @field_validator("nameservers")
    @classmethod
    def nameservers_ok(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        return _validate_nameservers(v)


class CtThresholdsSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    pinned_serials: list[str] = Field(default_factory=list)
    lookback_hours: int = Field(default=24, ge=1, le=720)
    alert_on_new_entry: bool = True

    @field_validator("pinned_serials")
    @classmethod
    def pinned_ok(cls, v: list[str]) -> list[str]:
        return _validate_pinned_serials(v)


class CtThresholdsUpdateSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    pinned_serials: list[str] | None = None
    lookback_hours: int | None = Field(default=None, ge=1, le=720)
    alert_on_new_entry: bool | None = None

    @field_validator("pinned_serials")
    @classmethod
    def pinned_ok(cls, v: list[str] | None) -> list[str] | None:
        if v is None:
            return v
        return _validate_pinned_serials(v)


class DnsCapabilityConfigSchema(PerCapabilityConfigSchema):
    thresholds: DnsThresholdsSchema = Field(default_factory=DnsThresholdsSchema)


class DnsCapabilityConfigUpdateSchema(PerCapabilityConfigUpdateSchema):
    thresholds: DnsThresholdsUpdateSchema | None = None


class CtCapabilityConfigSchema(PerCapabilityConfigSchema):
    thresholds: CtThresholdsSchema = Field(default_factory=CtThresholdsSchema)


class CtCapabilityConfigUpdateSchema(PerCapabilityConfigUpdateSchema):
    thresholds: CtThresholdsUpdateSchema | None = None


class MonitorCapabilitiesSchema(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True, extra="forbid")

    uptime_only: UptimeCapabilityConfigSchema
    content_change: ContentCapabilityConfigSchema
    ssl_expiry: SslCapabilityConfigSchema
    visual_change: VisualCapabilityConfigSchema
    dns_change: DnsCapabilityConfigSchema = Field(default_factory=DnsCapabilityConfigSchema)
    ct_log: CtCapabilityConfigSchema = Field(default_factory=CtCapabilityConfigSchema)

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
    dns_change: DnsCapabilityConfigUpdateSchema | None = None
    ct_log: CtCapabilityConfigUpdateSchema | None = None

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

    @model_validator(mode="after")
    def browser_fetch_mode_requires_long_interval(self) -> "MonitorCreateRequest":
        # Browser-mode probes launch Playwright per check; reject sub-300s
        # intervals at the API boundary so the service never sees them.
        if (
            _content_change_fetch_mode(self.capabilities) == "browser"
            and self.interval_seconds < MIN_BROWSER_FETCH_INTERVAL_SECONDS
        ):
            raise ValueError(
                "fetchMode='browser' requires intervalSeconds >= "
                f"{MIN_BROWSER_FETCH_INTERVAL_SECONDS} (per-check Playwright launch is expensive)"
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

    @model_validator(mode="after")
    def browser_fetch_mode_requires_long_interval(self) -> "MonitorUpdateRequest":
        # B-7: catch the obvious "PATCH lowering interval below 300s while
        # also enabling browser fetch in the same call". When only one of
        # the two fields is being updated we cannot enforce the constraint
        # here without loading the existing monitor, so monitor_service has
        # a defensive runtime guard for the partial-update case.
        if (
            _content_change_fetch_mode(self.capabilities) == "browser"
            and self.interval_seconds is not None
            and self.interval_seconds < MIN_BROWSER_FETCH_INTERVAL_SECONDS
        ):
            raise ValueError(
                "fetchMode='browser' requires intervalSeconds >= "
                f"{MIN_BROWSER_FETCH_INTERVAL_SECONDS} (per-check Playwright launch is expensive)"
            )
        return self


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
    p50_response_time_ms: float | None = None
    p95_response_time_ms: float | None = None
    p99_response_time_ms: float | None = None
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
    diff_summary: dict[str, Any]
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
    diff_summary: dict[str, Any] = Field(default_factory=dict)
    word_diff: dict[str, Any] | None = None
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
    # V-1: True for captures stored even though the probe failed (bot wall,
    # TLS error, 5xx). Excluded from dHash baseline comparison.
    is_diagnostic: bool = False


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
    p50_response_time: float = 0.0
    p95_response_time: float = 0.0
    p99_response_time: float = 0.0
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
    p50_response_time_ms: float = 0.0
    p95_response_time_ms: float
    p99_response_time_ms: float = 0.0
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


# ── Phase 2.2 — DNS change responses ──────────────────────────────────


class MonitorDnsRecordResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    record_type: str
    values: list[str]
    observed_at: datetime
    last_change_at: datetime | None = None


class MonitorDnsChangeResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    record_type: str
    detected_at: datetime
    previous_values: list[str]
    current_values: list[str]
    added_values: list[str]
    removed_values: list[str]


# ── Phase 2.3 — CT log responses ──────────────────────────────────────


class MonitorCtEntryResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    monitor_id: str
    hostname: str
    serial_number: str
    leaf_sha256: str | None = None
    issuer_name: str | None = None
    common_name: str | None = None
    not_before: datetime | None = None
    not_after: datetime | None = None
    observed_at: datetime
    crtsh_id: str | None = None
    pin_violation: bool = False
    alerted_at: datetime | None = None


# ── Phase 2.4 / 2b — Maintenance window CRUD + recurrence ────────────


# RRULE-lite: only daily/weekly are supported in Phase 2b. ``byWeekday`` is
# only meaningful for ``weekly`` (0=Monday … 6=Sunday, matching
# ``datetime.weekday()``). ``untilAt`` is an inclusive upper bound on
# occurrence start — beyond that the window stops repeating.
class MaintenanceRecurrenceSpec(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    freq: Literal["daily", "weekly"]
    by_weekday: list[int] | None = Field(default=None, max_length=7)
    until_at: datetime | None = None

    @model_validator(mode="after")
    def _validate(self) -> "MaintenanceRecurrenceSpec":
        if self.by_weekday is not None:
            for day in self.by_weekday:
                if day < 0 or day > 6:
                    raise ValueError("byWeekday entries must be in [0, 6]")
            # Dedupe + sort for stable storage
            self.by_weekday = sorted(set(self.by_weekday))
        if self.freq == "daily" and self.by_weekday:
            # Daily recurrences ignore byWeekday — drop it instead of erroring
            # so the UI can keep the value cached.
            self.by_weekday = None
        return self


class MaintenanceWindowResponse(BaseModel):
    model_config = ConfigDict(alias_generator=to_camel, populate_by_name=True)

    id: str
    user_id: int
    monitor_id: str | None = None
    title: str
    starts_at: datetime
    ends_at: datetime
    suppress_alerts: bool
    suppress_probes: bool
    is_enabled: bool
    notes: str | None = None
    recurrence: MaintenanceRecurrenceSpec | None = None
    tag_scope: list[str] | None = None
    created_at: datetime
    updated_at: datetime


class MaintenanceWindowCreateRequest(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    monitor_id: str | None = None
    title: str = Field(min_length=1, max_length=120)
    starts_at: datetime
    ends_at: datetime
    suppress_alerts: bool = True
    suppress_probes: bool = False
    is_enabled: bool = True
    notes: str | None = Field(default=None, max_length=500)
    recurrence: MaintenanceRecurrenceSpec | None = None
    tag_scope: list[str] | None = Field(default=None, max_length=20)

    @model_validator(mode="after")
    def _range_ok(self) -> "MaintenanceWindowCreateRequest":
        if self.ends_at <= self.starts_at:
            raise ValueError("endsAt must be after startsAt")
        if self.tag_scope is not None:
            cleaned = sorted({t.strip() for t in self.tag_scope if t.strip()})
            self.tag_scope = cleaned or None
        return self


class MaintenanceWindowUpdateRequest(BaseModel):
    model_config = ConfigDict(
        alias_generator=to_camel, populate_by_name=True, extra="forbid"
    )

    monitor_id: str | None = None
    clear_monitor_scope: bool = False
    title: str | None = Field(default=None, min_length=1, max_length=120)
    starts_at: datetime | None = None
    ends_at: datetime | None = None
    suppress_alerts: bool | None = None
    suppress_probes: bool | None = None
    is_enabled: bool | None = None
    notes: str | None = Field(default=None, max_length=500)
    recurrence: MaintenanceRecurrenceSpec | None = None
    clear_recurrence: bool = False
    tag_scope: list[str] | None = Field(default=None, max_length=20)
    clear_tag_scope: bool = False

    @model_validator(mode="after")
    def _normalize(self) -> "MaintenanceWindowUpdateRequest":
        if self.tag_scope is not None:
            cleaned = sorted({t.strip() for t in self.tag_scope if t.strip()})
            self.tag_scope = cleaned or None
        return self
