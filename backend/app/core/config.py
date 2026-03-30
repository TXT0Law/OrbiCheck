from pydantic import computed_field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

from app.core.change_category_defaults import (
    DEFAULT_CHANGE_CATEGORY_MEDIUM_MAX,
    DEFAULT_CHANGE_CATEGORY_SMALL_MAX,
)


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        case_sensitive=False,
    )

    APP_ENV: str = "development"
    DEBUG: bool = False

    DATABASE_URL: str = ""
    # Async SQLAlchemy pool (API server only). Keep modest so dev Postgres max_connections
    # is not exhausted alongside Celery sync tasks and other tools.
    DB_POOL_SIZE: int = 8
    DB_MAX_OVERFLOW: int = 4

    REDIS_URL: str = "redis://localhost:6379/0"

    SCAN_SERVICE_URL: str = "http://localhost:4000"

    CORS_ORIGINS: list[str] = ["http://localhost:3000"]

    SCAN_TIMEOUT_MS: int = 60000
    SCAN_MAX_CONCURRENT_MODULES: int = 10

    # Monitor / uptime probing
    AUTH_COOKIE_NAME: str = "orbicheck_auth"
    AUTH_CSRF_COOKIE_NAME: str = "orbicheck_csrf"
    AUTH_SESSION_SECRET: str = ""
    AUTH_LOGIN_EMAIL: str = "admin@orbicheck.local"
    AUTH_LOGIN_PASSWORD: str = ""
    AUTH_SESSION_TTL_SECONDS: int = 60 * 60 * 24 * 7
    AUTH_COOKIE_SECURE: bool = True
    AUTH_COOKIE_SAMESITE: str = "strict"
    AUTH_COOKIE_DOMAIN: str | None = None
    MAX_MONITORS_PER_USER: int = 50
    MIN_MONITOR_INTERVAL_SECONDS: int = 10
    MAX_MONITOR_INTERVAL_SECONDS: int = 3600
    MONITOR_REQUEST_TIMEOUT_S: float = 15.0
    MONITOR_PROBE_MAX_BODY_BYTES: int = 1024
    MONITOR_PROBE_USER_AGENT: str = (
        "OrbiCheck-Monitor/1.0 (+https://github.com/TXT0Law/OrbiCheck)"
    )
    MONITOR_MANUAL_CHECK_COOLDOWN_SECONDS: int = 10
    # Prevents overlapping scheduled checks when probe duration > interval (slow targets).
    MONITOR_CHECK_LOCK_TTL_SECONDS: int = 900
    MONITOR_SSE_HEARTBEAT_SECONDS: float = 25.0
    # When True, POST monitor Pub/Sub events to user webhook (if configured in Redis).
    MONITOR_WEBHOOK_DISPATCH_ENABLED: bool = True
    MONITOR_WEBHOOK_TIMEOUT_S: float = 8.0
    # Email notification
    SMTP_HOST: str = ""
    SMTP_PORT: int = 587
    SMTP_USER: str = ""
    SMTP_PASSWORD: str = ""
    SMTP_FROM_EMAIL: str = "noreply@orbicheck.app"
    SMTP_FROM_NAME: str = "OrbiCheck Alerts"
    SMTP_USE_TLS: bool = True
    EMAIL_DISPATCH_ENABLED: bool = False
    # When True, FastAPI runs a 10s loop that executes due monitor checks in-process.
    # Use when Celery worker+beat are not running (e.g. manual uvicorn). quickstart/start.sh
    # sets MONITOR_INLINE_DISPATCH=0 when it starts Celery, and 1 when Celery is disabled.
    MONITOR_INLINE_DISPATCH: bool = False
    MONITOR_INLINE_DISPATCH_INTERVAL_S: float = 10.0
    # SSL probe (TLS inspection, separate from HTTP client timeout)
    SSL_PROBE_TIMEOUT_SECONDS: float = 10.0
    SSL_DEFAULT_WARN_DAYS: int = 30
    SSL_DEFAULT_CRITICAL_DAYS: int = 7
    SSL_LIVE_PROBE_COOLDOWN_SECONDS: int = 30
    # Cap snapshot text used for diff API (full snapshot still stored in DB).
    MONITOR_DIFF_MAX_CHARS_PER_SIDE: int = 500_000
    # Line cap before HtmlDiff (CPU/memory guard).
    MONITOR_DIFF_MAX_LINES: int = 10_000
    # Stricter cap for API diff endpoint table/unified generation (keeps response under client timeout).
    MONITOR_DIFF_HTML_TABLE_MAX_LINES: int = 4_000
    # Max decoded body size for content_change captures.
    MONITOR_MAX_BODY_BYTES: int = 5 * 1024 * 1024
    # Retention for osint_monitor_snapshots (Celery task).
    MONITOR_MAX_SNAPSHOTS_PER_MONITOR: int = 100
    MONITOR_MAX_SNAPSHOT_AGE_DAYS: int = 90
    MONITOR_MIN_RETAINED_SNAPSHOTS: int = 5
    # Retention for osint_monitor_changes (same Celery task as snapshots).
    MONITOR_MAX_CHANGES_PER_MONITOR: int = 500
    MONITOR_MAX_CHANGE_AGE_DAYS: int = 90
    MONITOR_MIN_RETAINED_CHANGES: int = 20

    # visual_change (Playwright screenshot via Scan Service)
    MONITOR_SCREENSHOT_TIMEOUT_S: float = 55.0
    MONITOR_VISUAL_MAX_IMAGE_BYTES: int = 8 * 1024 * 1024
    MONITOR_MAX_VISUAL_CAPTURES_PER_MONITOR: int = 120
    MONITOR_MAX_VISUAL_CAPTURE_AGE_DAYS: int = 90
    MONITOR_MIN_RETAINED_VISUAL_CAPTURES: int = 5
    MONITOR_MAX_VISUAL_CHANGES_PER_MONITOR: int = 500
    MONITOR_MAX_VISUAL_CHANGE_AGE_DAYS: int = 90
    MONITOR_MIN_RETAINED_VISUAL_CHANGES: int = 20
    # Nearest visual capture search for content ↔ screenshot linking (fallback to check_id).
    CONTENT_VISUAL_CORRELATION_WINDOW_SECONDS: int = 120

    # Content thresholds / categories (also used by content_change_helpers)
    MIN_DIFF_LINES_OVERRIDE: int = 3
    CHANGE_CATEGORY_SMALL_MAX: int = DEFAULT_CHANGE_CATEGORY_SMALL_MAX
    CHANGE_CATEGORY_MEDIUM_MAX: int = DEFAULT_CHANGE_CATEGORY_MEDIUM_MAX

    # Server kill-switch: when False, content_change uses raw SHA-256 only (legacy behavior).
    # When True (default), per-monitor normalizeVolatileTokens applies (see content_change_helpers).
    CONTENT_NORMALIZATION_ENABLED: bool = True
    # P3: apply optional per-monitor regex rules from capabilities (normalizationRules).
    CONTENT_CUSTOM_NORMALIZATION_RULES_ENABLED: bool = True
    # P2: skip recording a new MonitorChange when unified-diff fingerprint matches the last
    # change within this window (reduces near-duplicate rows).
    MONITOR_CHANGE_DEDUP_ENABLED: bool = True
    MONITOR_CHANGE_DEDUP_WINDOW_SECONDS: int = 600
    # P2: retention task also drops older of consecutive duplicate-fingerprint pairs.
    MONITOR_CHANGE_DEDUP_RETENTION_ENABLED: bool = True
    # Cap unified diff text before hashing for diffFingerprint (CPU / memory guard).
    MONITOR_DIFF_FINGERPRINT_MAX_UNIFIED_CHARS: int = 200_000
    # P3: max regex replace rules per monitor (capabilities JSON).
    MONITOR_NORMALIZATION_CUSTOM_RULES_MAX: int = 10
    # P3: future rendered-DOM / headless pipeline — must stay off unless explicitly enabled.
    MONITOR_RENDERED_DOM_PIPELINE_ENABLED: bool = False
    # Optional CSS selector extraction for content_change (BeautifulSoup; server-side HTML only).
    CONTENT_SELECTOR_EXTRACTION_ENABLED: bool = False
    CONTENT_SELECTOR_MAX_COUNT: int = 8
    CONTENT_SELECTOR_MAX_EXTRACTED_CHARS: int = 500_000
    CONTENT_SELECTOR_MAX_NODES_PER_SELECTOR: int = 2_000
    # Audit PDF export for monitor changes (fpdf2); off by default for light deployments.
    MONITOR_CHANGES_EXPORT_PDF_ENABLED: bool = False
    # Relative URL prefix for diff links in CSV (no origin; clients prepend ORIGIN).
    API_V1_PREFIX: str = "/api/v1"
    MONITOR_CHANGES_EXPORT_MAX_ROWS: int = 5_000
    REPORT_GENERATION_ENABLED: bool = True
    REPORT_MAX_PER_USER: int = 50
    REPORT_PDF_LOGO_PATH: str | None = None
    # Extra timestamp-shaped collapsing in normalize_body_for_comparison (off by default; test before enable).
    CONTENT_EXTENDED_VOLATILE_NORMALIZATION_ENABLED: bool = False
    # Collapse 4+ digit runs inside unified-diff text before diffFingerprint hash (off by default).
    MONITOR_DIFF_FINGERPRINT_EXTRA_NORMALIZE: bool = False
    # Expose Prometheus metrics at GET /metrics when True (ops / dashboards).
    PROMETHEUS_METRICS_ENABLED: bool = False
    RATE_LIMIT_WINDOW_SECONDS: int = 60
    RATE_LIMIT_DEFAULT_REQUESTS: int = 120
    RATE_LIMIT_AUTH_REQUESTS: int = 10
    RATE_LIMIT_SCAN_CREATE_REQUESTS: int = 10
    CORS_ALLOW_METHODS: list[str] = ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"]
    CORS_ALLOW_HEADERS: list[str] = ["Accept", "Content-Type", "X-CSRF-Token"]
    SECURITY_HEADERS_ENABLED: bool = True
    SECURITY_HEADER_CSP: str = (
        "default-src 'self'; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; "
        "script-src 'self' 'unsafe-inline' 'unsafe-eval'; connect-src 'self' http: https: ws: wss:; "
        "font-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"
    )

    @computed_field  # type: ignore[prop-decorator]
    @property
    def MAX_BODY_BYTES(self) -> int:
        """Alias for prompts/docs; same as MONITOR_MAX_BODY_BYTES."""
        return self.MONITOR_MAX_BODY_BYTES

    @computed_field  # type: ignore[prop-decorator]
    @property
    def DIFF_MAX_LINES(self) -> int:
        return self.MONITOR_DIFF_MAX_LINES

    @computed_field  # type: ignore[prop-decorator]
    @property
    def MAX_SNAPSHOTS_PER_MONITOR(self) -> int:
        return self.MONITOR_MAX_SNAPSHOTS_PER_MONITOR

    @computed_field  # type: ignore[prop-decorator]
    @property
    def MAX_SNAPSHOT_AGE_DAYS(self) -> int:
        return self.MONITOR_MAX_SNAPSHOT_AGE_DAYS

    @computed_field  # type: ignore[prop-decorator]
    @property
    def MIN_RETAINED_SNAPSHOTS(self) -> int:
        return self.MONITOR_MIN_RETAINED_SNAPSHOTS

    @computed_field  # type: ignore[prop-decorator]
    @property
    def REQUEST_TIMEOUT_S(self) -> float:
        return self.MONITOR_REQUEST_TIMEOUT_S

    @field_validator("CORS_ORIGINS", mode="before")
    @classmethod
    def validate_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, list):
            return value
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("[") and value.endswith("]"):
                import json

                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return [str(item) for item in parsed]
            return [v.strip() for v in value.split(",") if v.strip()]
        raise ValueError("Invalid CORS_ORIGINS value")

    @field_validator("CORS_ALLOW_METHODS", "CORS_ALLOW_HEADERS", mode="before")
    @classmethod
    def validate_string_list(
        cls, value: str | list[str]
    ) -> list[str]:
        if isinstance(value, list):
            return [str(item).strip() for item in value if str(item).strip()]
        if isinstance(value, str):
            value = value.strip()
            if value.startswith("[") and value.endswith("]"):
                import json

                parsed = json.loads(value)
                if isinstance(parsed, list):
                    return [str(item).strip() for item in parsed if str(item).strip()]
            return [item.strip() for item in value.split(",") if item.strip()]
        raise ValueError("Invalid list value")


settings = Settings()
