import re
import uuid
from datetime import datetime
from typing import Any
from urllib.parse import urlparse

from pydantic import BaseModel, ConfigDict, Field, field_validator
from pydantic.alias_generators import to_camel

from app.models.scan import ModuleStatus, ScanStatus
from app.utils.url_safety import validate_url_safety

# ─── Validation Constants ─────────────────────────────────────────────

MAX_URL_LENGTH = 2048
ALLOWED_SCHEMES = frozenset({"http", "https"})

XSS_BLACKLIST: list[re.Pattern[str]] = [
    re.compile(r"<script\b", re.IGNORECASE),
    re.compile(r"javascript:", re.IGNORECASE),
    re.compile(r"on\w+\s*=", re.IGNORECASE),
    re.compile(r"vbscript:", re.IGNORECASE),
    re.compile(r"data:\s*text/html", re.IGNORECASE),
    re.compile(r"&#\d+;"),
    re.compile(r"&#x[\da-f]+;", re.IGNORECASE),
]

SQL_BLACKLIST: list[re.Pattern[str]] = [
    re.compile(
        r"\b(SELECT|INSERT|UPDATE|DELETE|DROP|UNION|ALTER|CREATE|EXEC)\b",
        re.IGNORECASE,
    ),
    re.compile(r"['\"];\s*--"),
    re.compile(r"/\*.*\*/"),
]

DANGEROUS_CHARS = re.compile(r"[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]")

PRIVATE_HOST_PATTERNS: list[re.Pattern[str]] = [
    re.compile(r"^localhost$", re.IGNORECASE),
    re.compile(r"^127\."),
    re.compile(r"^10\."),
    re.compile(r"^172\.(1[6-9]|2\d|3[01])\."),
    re.compile(r"^192\.168\."),
    re.compile(r"^0\.0\.0\.0$"),
    re.compile(r"^::1$"),
    re.compile(r"\.local$", re.IGNORECASE),
    re.compile(r"\.internal$", re.IGNORECASE),
]


class ScanCreateRequest(BaseModel):
    url: str
    modules: list[str] | None = None  # If provided, only run these; otherwise all.

    @field_validator("url")
    @classmethod
    def validate_url(cls, value: str) -> str:
        """Validate URL for format, security, and safety."""
        value = value.strip()

        if len(value) > MAX_URL_LENGTH:
            raise ValueError(f"URL too long (max {MAX_URL_LENGTH} characters)")

        if DANGEROUS_CHARS.search(value):
            raise ValueError("URL contains invalid characters")

        for pattern in XSS_BLACKLIST:
            if pattern.search(value):
                raise ValueError("Potentially unsafe URL")

        for pattern in SQL_BLACKLIST:
            if pattern.search(value):
                raise ValueError("Potentially unsafe URL")

        if not re.match(r"^https?://", value, re.IGNORECASE):
            value = f"https://{value}"

        parsed = urlparse(value)

        if parsed.scheme not in ALLOWED_SCHEMES:
            raise ValueError(f"Only HTTP/HTTPS allowed (got {parsed.scheme})")

        if not parsed.hostname:
            raise ValueError("URL must have a valid hostname")

        for pattern in PRIVATE_HOST_PATTERNS:
            if pattern.search(parsed.hostname):
                raise ValueError("Cannot scan private/internal addresses")

        if "." not in parsed.hostname:
            raise ValueError("URL must have a valid domain name")

        validate_url_safety(value)
        return value


class ScanModuleResultResponse(BaseModel):
    id: uuid.UUID
    module_name: str
    status: ModuleStatus
    raw_result: Any = None
    error_message: str | None = None
    duration_ms: int | None = None
    completed_at: datetime | None = None

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ScanResponse(BaseModel):
    id: uuid.UUID
    url: str
    domain: str
    status: ScanStatus
    progress: int
    total_modules: int
    completed_modules: int
    security_score: int | None = None
    error_message: str | None = None
    started_at: datetime | None = None
    completed_at: datetime | None = None
    created_at: datetime

    model_config = ConfigDict(
        from_attributes=True,
        alias_generator=to_camel,
        populate_by_name=True,
    )


class SecurityScoreBreakdown(BaseModel):
    """V2 security score decomposition (detail API only when score is derived)."""

    base_score: float
    confidence: float
    severity_cap_applied: str | None = None
    category_scores: dict[str, float]

    model_config = ConfigDict(
        alias_generator=to_camel,
        populate_by_name=True,
    )


class ScanDetailResponse(ScanResponse):
    """Scan with all module results included."""

    module_results: list[ScanModuleResultResponse] = Field(default_factory=list)
    security_score_breakdown: SecurityScoreBreakdown | None = None


class ScanListResponse(BaseModel):
    scans: list[ScanResponse]
    total: int
