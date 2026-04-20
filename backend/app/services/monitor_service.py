"""Monitor CRUD, check execution, aggregates, and diff helpers."""

# ──────────────────────────────────────────────
# Dynamic content / noise (content_change)
# ──────────────────────────────────────────────
#
# Optional normalization + degraded-page suppression (see content_change_helpers).
# minChangeSizeBytes: 0 records any change that passes fingerprint + threshold logic
# (not every raw byte flip if normalization treats bodies as equal). Raise the byte
# threshold to ignore smaller edits; disable content_change for very noisy targets.
# ──────────────────────────────────────────────

from __future__ import annotations

import asyncio
import copy
import csv
import io
import json
import math
import re
import ssl
import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
import httpx
import structlog
from redis.asyncio import Redis
from sqlalchemy import and_, func, or_, select, text
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.v1.schemas.monitor import (
    CapabilityStatusSummary,
    ChainEntrySummary,
    MonitorBaselineResponse,
    MonitorChangeResponse,
    MonitorCheckResponse,
    MonitorCreateRequest,
    MonitorCurrentStreak,
    MonitorDiffResponse,
    MonitorFailureDistribution,
    MonitorResponse,
    MonitorSslStatusResponse,
    MonitorTimeSeriesBucket,
    MonitorTimeSeriesData,
    MonitorUpdateRequest,
    MonitorUptimeSummaryResponse,
    MonitorVisualCaptureResponse,
    MonitorVisualChangeResponse,
    dump_capabilities_patch,
    validate_capabilities_config,
)
from app.core.config import settings
from app.db.session import async_session_factory
from app.core.exceptions import (
    AppException,
    ChangeNotFoundException,
    NotFoundError,
    SslNotEnabledException,
    SnapshotNotFoundException,
    ValidationError,
)
from app.core.monitor_defaults import (
    CAPABILITY_KEYS,
    capabilities_from_enabled_list,
    merge_capability_dict,
)
from app.models.monitor import (
    CheckErrorType,
    Monitor,
    MonitorChange,
    MonitorCheck,
    MonitorSnapshot,
    MonitorStatus,
    MonitorVisualCapture,
    MonitorVisualChange,
)
from app.services import alert_service
from app.services.ssl_probe import (
    extract_host_port,
    probe_ssl_async,
)
from app.metrics import (
    inc_alert_suppressed,
    inc_below_threshold,
    inc_detected,
    inc_suppressed,
)
from app.services.content_visual_correlation import (
    CorrelationMethod,
    resolve_linked_visual_captures_for_changes,
)
from app.services.scan_client import call_screenshot_service
from app.services.user_notification_settings import dispatch_monitor_webhook
from app.services.visual_change_helpers import (
    DHASH_BIT_LENGTH,
    compute_dhash_hex,
    decode_screenshot_payload,
    get_visual_thresholds,
    hamming_between_hex,
    is_visual_change_detected,
    similarity_percent_from_hamming,
)
from app.services.content_alert_suppression import (
    decide_content_change_notification,
    diff_fingerprint_prefix,
    get_content_alert_suppression_settings,
)
from app.services.content_change_helpers import (
    compile_custom_normalization_rules,
    compute_content_fingerprint,
    compute_diff_summary,
    compute_unified_diff_fingerprint,
    detect_degraded_page,
    evaluate_content_threshold,
    extract_charset,
    generate_html_diff,
    generate_unified_diff,
    get_content_thresholds,
    normalize_body_for_comparison,
    validate_content_response,
)
from app.services.content_selector_extraction import (
    SelectorValidationError,
    extract_for_content_pipeline,
    get_selector_extraction_config,
    validate_selectors_against_html,
)
from app.utils.url_safety import validate_url_safety

logger = structlog.get_logger(__name__)

# Capabilities for which a *probe* outcome (not just enabled flag) determines
# `MonitorCheck.success`. When the only enabled capability is in this set and
# no HTTP probe ran, the SSL probe outcome must drive `check.success`.
SSL_ONLY_PROBE_REQUIRED: frozenset[str] = frozenset({"ssl_expiry"})

# HTTP methods that conventionally carry a request body. When `content_change`
# is enabled with one of these the user usually expects the body to be sent;
# we currently lack a column for it (P1 follow-up — see TODO inside
# `execute_check`) so we log a hint to surface the gap.
_BODY_BEARING_METHODS: frozenset[str] = frozenset({"POST", "PUT", "PATCH"})

PERIOD_TO_DELTA = {
    "24h": timedelta(hours=24),
    "7d": timedelta(days=7),
    "30d": timedelta(days=30),
    "90d": timedelta(days=90),
}

PERIOD_SERIES_CONFIG: dict[str, tuple[timedelta, int]] = {
    "24h": (timedelta(hours=24), 300),
    "7d": (timedelta(days=7), 1800),
    "30d": (timedelta(days=30), 7200),
    "90d": (timedelta(days=90), 21600),
}

SERIES_RESOLUTION_LABEL: dict[int, str] = {
    300: "5m",
    1800: "30m",
    7200: "2h",
    21600: "6h",
}


@dataclass(frozen=True)
class _UptimeThresholdsParsed:
    max_response_time_ms: float | None
    consecutive_failures: int
    alert_on_unexpected_status: bool


def _evaluate_probe_success(
    status_code: int | None,
    expected_status_code: int | None,
) -> bool:
    """Whether HTTP status counts as success for probe gating (uptime + content)."""
    if status_code is None:
        return False
    if expected_status_code is not None:
        return status_code == expected_status_code
    return 200 <= status_code < 400


def _parse_uptime_thresholds(monitor: Monitor) -> _UptimeThresholdsParsed:
    caps = monitor.capabilities or {}
    raw = caps.get("uptime_only") if isinstance(caps, dict) else None
    th = (raw or {}).get("thresholds") if isinstance(raw, dict) else None
    th = th if isinstance(th, dict) else {}
    max_ms = th.get("maxResponseTimeMs")
    max_f: float | None = float(max_ms) if max_ms is not None else None
    cf = th.get("consecutiveFailures", 3)
    try:
        cf_i = max(1, int(cf))
    except (TypeError, ValueError):
        cf_i = 3
    return _UptimeThresholdsParsed(
        max_response_time_ms=max_f,
        consecutive_failures=cf_i,
        alert_on_unexpected_status=bool(th.get("alertOnUnexpectedStatus", True)),
    )


@dataclass(frozen=True)
class SslThresholds:
    warn_days_remaining: int
    critical_days_remaining: int


def _ssl_thresholds_from_config(ssl_cfg: Any) -> SslThresholds:
    if isinstance(ssl_cfg, dict):
        th = ssl_cfg.get("thresholds")
        if isinstance(th, dict):
            return SslThresholds(
                warn_days_remaining=int(th.get("warnDaysRemaining", settings.SSL_DEFAULT_WARN_DAYS)),
                critical_days_remaining=int(
                    th.get("criticalDaysRemaining", settings.SSL_DEFAULT_CRITICAL_DAYS)
                ),
            )
    return SslThresholds(
        warn_days_remaining=settings.SSL_DEFAULT_WARN_DAYS,
        critical_days_remaining=settings.SSL_DEFAULT_CRITICAL_DAYS,
    )


def _is_ssl_enabled(monitor: Monitor) -> bool:
    if "ssl_expiry" not in (monitor.enabled_capabilities or []):
        return False
    caps = monitor.capabilities or {}
    ssl_cfg = caps.get("ssl_expiry", {})
    if isinstance(ssl_cfg, bool):
        return ssl_cfg
    if isinstance(ssl_cfg, dict):
        return bool(ssl_cfg.get("enabled", True))
    return False


def _is_https(url: str) -> bool:
    return str(url).lower().startswith("https://")


def _evaluate_ssl_severity(
    days_remaining: int | None,
    is_expired: bool,
    thresholds: SslThresholds,
) -> str:
    if days_remaining is None:
        return "unknown"
    if is_expired or days_remaining < 0:
        return "critical"
    if days_remaining <= thresholds.critical_days_remaining:
        return "critical"
    if days_remaining <= thresholds.warn_days_remaining:
        return "warning"
    return "ok"


def _is_expiring_soon_ssl(days_remaining: int | None, thresholds: SslThresholds) -> bool:
    if days_remaining is None or days_remaining < 0:
        return False
    return days_remaining <= thresholds.warn_days_remaining


def _snapshot_to_ssl_response(
    snapshot: dict[str, Any],
    checked_at: datetime,
    thresholds: SslThresholds,
) -> MonitorSslStatusResponse:
    if not snapshot.get("success", True):
        return MonitorSslStatusResponse(
            days_remaining=None,
            expiry_date=None,
            issuer=None,
            subject=None,
            is_valid=False,
            severity_level="unknown",
            is_expiring_soon=False,
            is_expired=False,
            subject_alternative_names=[],
            chain_summary=[],
            last_checked_at=checked_at,
            serial_number=None,
            signature_algorithm=None,
            sha256_fingerprint=None,
            error=snapshot.get("error_message"),
            valid_from="",
            valid_to="",
        )

    days_remaining = snapshot.get("days_remaining")
    dr_int = int(days_remaining) if days_remaining is not None else None
    is_expired = bool(snapshot.get("is_expired", False))
    severity = _evaluate_ssl_severity(dr_int, is_expired, thresholds)
    nb = snapshot.get("not_before") or ""
    na = snapshot.get("not_after") or ""

    chain_raw = snapshot.get("chain", [])
    chain_summary: list[ChainEntrySummary] = []
    if isinstance(chain_raw, list):
        for i, c in enumerate(chain_raw):
            if not isinstance(c, dict):
                continue
            chain_summary.append(
                ChainEntrySummary(
                    subject_dn=str(c.get("subject_dn", "")),
                    issuer_dn=str(c.get("issuer_dn", "")),
                    valid_from=str(c.get("not_before", "")),
                    valid_to=str(c.get("not_after", "")),
                    sha256_fingerprint=str(c.get("sha256_fingerprint", "")),
                    position=int(c.get("position", i)),
                    is_leaf=bool(c.get("is_leaf", i == 0)),
                )
            )

    return MonitorSslStatusResponse(
        days_remaining=dr_int,
        expiry_date=str(na) if na else None,
        issuer=snapshot.get("issuer_dn"),
        subject=snapshot.get("subject_dn"),
        is_valid=bool(snapshot.get("is_valid", False)),
        severity_level=severity,
        is_expiring_soon=_is_expiring_soon_ssl(dr_int, thresholds),
        is_expired=is_expired,
        subject_alternative_names=list(snapshot.get("subject_alternative_names") or []),
        chain_summary=chain_summary,
        last_checked_at=checked_at,
        serial_number=snapshot.get("serial_number"),
        signature_algorithm=snapshot.get("signature_algorithm"),
        sha256_fingerprint=snapshot.get("sha256_fingerprint"),
        error=None,
        valid_from=str(nb),
        valid_to=str(na),
    )


async def _get_latest_ssl_check(
    monitor_id: uuid.UUID,
    db: AsyncSession,
) -> MonitorCheck | None:
    stmt = (
        select(MonitorCheck)
        .where(
            MonitorCheck.monitor_id == monitor_id,
            MonitorCheck.ssl_snapshot.isnot(None),
        )
        .order_by(MonitorCheck.checked_at.desc())
        .limit(1)
    )
    return (await db.execute(stmt)).scalar_one_or_none()


async def _live_ssl_probe(monitor: Monitor, db: AsyncSession) -> MonitorSslStatusResponse:
    validate_url_safety(str(monitor.url))
    if not _is_https(str(monitor.url)):
        raise ValidationError(
            code="SSL_REQUIRES_HTTPS",
            message="SSL monitoring requires an https URL",
        )
    hostname, port = extract_host_port(str(monitor.url))
    probe_result = await probe_ssl_async(
        hostname, port, timeout=settings.SSL_PROBE_TIMEOUT_SECONDS
    )
    snapshot_dict = probe_result.to_dict()
    now = datetime.now(timezone.utc)
    if probe_result.success:
        monitor.ssl_expiry_days = probe_result.days_remaining
        monitor.last_ssl_probe_at = now
    thresholds = _ssl_thresholds_from_config(monitor.capabilities.get("ssl_expiry", {}))
    await db.flush()
    return _snapshot_to_ssl_response(snapshot_dict, now, thresholds)


def _determine_status(
    success: bool,
    is_degraded: bool,
    consecutive_failures: int,
    threshold_consecutive: int,
) -> MonitorStatus:
    if not success:
        if consecutive_failures >= threshold_consecutive:
            return MonitorStatus.DOWN
        return MonitorStatus.DEGRADED
    if is_degraded:
        return MonitorStatus.DEGRADED
    return MonitorStatus.UP


def _count_incidents_from_successes(successes: list[bool]) -> int:
    incidents = 0
    prev_ok = True
    for s in successes:
        if not s and prev_ok:
            incidents += 1
        prev_ok = s
    return incidents


def _error_type_to_api_label(err: CheckErrorType | None) -> str | None:
    if err is None:
        return None
    mapping = {
        CheckErrorType.TIMEOUT: "TIMEOUT",
        CheckErrorType.DNS_RESOLUTION: "DNS",
        CheckErrorType.CONNECTION_REFUSED: "CONNECTION",
        CheckErrorType.SSL_ERROR: "SSL",
        CheckErrorType.HTTP_ERROR: "HTTP_ERROR",
        CheckErrorType.CONTENT_TOO_LARGE: "HTTP_ERROR",
        CheckErrorType.UNKNOWN: "UNKNOWN",
    }
    return mapping.get(err, "UNKNOWN")


def _failure_distribution_counts(rows: list[MonitorCheck]) -> MonitorFailureDistribution:
    counts = {
        "TIMEOUT": 0,
        "DNS": 0,
        "CONNECTION": 0,
        "SSL": 0,
        "HTTP_ERROR": 0,
        "UNKNOWN": 0,
    }
    for r in rows:
        if r.success:
            continue
        label = _error_type_to_api_label(r.error_type) or "UNKNOWN"
        if label not in counts:
            label = "UNKNOWN"
        counts[label] += 1
    return MonitorFailureDistribution(**counts)


def _current_streak_from_rows(rows: list[MonitorCheck]) -> MonitorCurrentStreak | None:
    if not rows:
        return None
    newest = rows[-1]
    up = bool(newest.success)
    since_idx = len(rows) - 1
    for i in range(len(rows) - 2, -1, -1):
        if bool(rows[i].success) != up:
            break
        since_idx = i
    since = rows[since_idx].checked_at
    if since.tzinfo is None:
        since = since.replace(tzinfo=timezone.utc)
    end = newest.checked_at
    if end.tzinfo is None:
        end = end.replace(tzinfo=timezone.utc)
    duration = max(0, int((end - since).total_seconds()))
    return MonitorCurrentStreak(
        status="up" if up else "down",
        since=since,
        duration_seconds=duration,
    )


def _user_live_channel(user_id: int) -> str:
    return f"monitor:user:{user_id}:events"


async def _publish_monitor_event(
    redis: Redis | None,
    monitor_id: uuid.UUID,
    user_id: int,
    event_name: str,
    payload: dict,
    *,
    dispatch_webhook: bool = True,
) -> None:
    if redis is None:
        return
    per_monitor = json.dumps({"event": event_name, "data": payload})
    await redis.publish(f"monitor:{monitor_id}:events", per_monitor)
    await redis.publish(
        _user_live_channel(user_id),
        json.dumps(
            {
                "event": event_name,
                "monitorId": str(monitor_id),
                "data": payload,
            }
        ),
    )
    if dispatch_webhook:
        await dispatch_monitor_webhook(user_id, monitor_id, event_name, payload)


def _normalize_capability_tokens(raw: list[str] | None) -> list[str]:
    """DB may store legacy enum-style names (e.g. SSL_EXPIRY); API uses snake_case keys."""
    if not raw:
        return []
    out: list[str] = []
    for x in raw:
        t = str(x).strip().lower().replace("-", "_")
        if t in CAPABILITY_KEYS:
            out.append(t)
    return out


def _sync_capability_enabled_flags(monitor: Monitor) -> None:
    monitor.enabled_capabilities = _normalize_capability_tokens(list(monitor.enabled_capabilities or []))
    en = set(monitor.enabled_capabilities)
    raw = monitor.capabilities
    if not isinstance(raw, dict) or not raw:
        monitor.capabilities = capabilities_from_enabled_list(monitor.enabled_capabilities)
        return
    caps = copy.deepcopy(raw)
    for k in CAPABILITY_KEYS:
        if k not in caps or not isinstance(caps.get(k), dict):
            continue
        caps[k]["enabled"] = k in en
    monitor.capabilities = caps


def _capabilities_record_from_orm(raw: Any) -> dict[str, Any]:
    """JSONB may be null or corrupted; avoid dict() on non-mappings (would 500 on save)."""
    if isinstance(raw, dict) and raw:
        return raw
    return {}


def _capabilities_for_api(m: Monitor) -> tuple[list[str], dict]:
    """Normalized enabled list + capabilities dict for JSON (no ORM mutation)."""
    enabled = _normalize_capability_tokens(list(m.enabled_capabilities or []))
    caps = merge_capability_dict(
        capabilities_from_enabled_list(enabled),
        _capabilities_record_from_orm(m.capabilities),
    )
    try:
        caps = validate_capabilities_config(caps)
    except Exception:
        caps = copy.deepcopy(caps)
    return enabled, caps


def _compute_capability_statuses(
    m: Monitor,
    enabled_norm: list[str],
    caps_norm: dict,
    content_extra: dict[str, Any] | None = None,
    latest_ssl_check: MonitorCheck | None = None,
) -> list[CapabilityStatusSummary]:
    enabled = set(enabled_norm)
    caps = caps_norm
    last_at = m.last_check_at
    out: list[CapabilityStatusSummary] = []

    for cap in CAPABILITY_KEYS:
        if cap not in enabled:
            out.append(
                CapabilityStatusSummary(
                    capability=cap,
                    status="disabled",
                    last_check_at=None,
                    last_value=None,
                    summary=None,
                )
            )
            continue

        status = "pending"
        summary: str | None = None
        last_value: str | None = None

        if cap == "uptime_only":
            pct = m.uptime_percentage
            if m.status == MonitorStatus.DOWN:
                status = "critical"
            elif m.status == MonitorStatus.DEGRADED:
                status = "warning"
            else:
                status = "healthy"
            if pct is not None:
                summary = f"{pct:.1f}% uptime (rolling ~30d aggregate on monitor)"
                last_value = str(pct)
            else:
                summary = "Collecting uptime data"
        elif cap == "content_change":
            n7 = int((content_extra or {}).get("changes_7d") or 0)
            base_age = (content_extra or {}).get("baseline_age_days")
            total_c = int(m.total_changes_detected or 0)
            if m.last_change_detected_at:
                status = "warning"
            elif n7 > 0:
                status = "warning"
            else:
                status = "healthy"
            parts: list[str] = []
            if n7:
                parts.append(f"{n7} changes detected in last 7 days")
            if total_c:
                parts.append(f"{total_c} total changes recorded")
            if base_age is not None:
                parts.append(f"baseline age ~{base_age} days")
            if parts:
                summary = ". ".join(parts)
            elif m.last_change_detected_at:
                summary = "Change detected"
            else:
                summary = "No changes recorded"
            last_value = (
                m.last_change_detected_at.isoformat() if m.last_change_detected_at else None
            )
        elif cap == "ssl_expiry":
            ssl_cfg = caps.get("ssl_expiry", {})
            th_obj = _ssl_thresholds_from_config(ssl_cfg if isinstance(ssl_cfg, dict) else {})
            status_map = {
                "ok": "healthy",
                "warning": "warning",
                "critical": "critical",
                "unknown": "pending",
            }
            if (
                latest_ssl_check
                and latest_ssl_check.ssl_snapshot
                and isinstance(latest_ssl_check.ssl_snapshot, dict)
            ):
                snap = latest_ssl_check.ssl_snapshot
                last_at = latest_ssl_check.checked_at
                if not snap.get("success", False):
                    status = "error"
                    summary = f"SSL probe failed: {snap.get('error_type', 'unknown')}"
                    last_value = str(snap.get("error_type", ""))
                else:
                    sev = _evaluate_ssl_severity(
                        snap.get("days_remaining"),
                        bool(snap.get("is_expired", False)),
                        th_obj,
                    )
                    status = status_map.get(sev, "pending")
                    days = snap.get("days_remaining")
                    if (days is not None and int(days) < 0) or snap.get("is_expired"):
                        summary = "Certificate expired"
                    elif days is not None:
                        summary = f"Certificate expires in {days} days"
                    else:
                        summary = "SSL status unknown"
                    last_value = str(days) if days is not None else None
                out.append(
                    CapabilityStatusSummary(
                        capability=cap,
                        status=status,
                        last_check_at=last_at,
                        last_value=last_value,
                        summary=summary,
                    )
                )
                continue
            days = m.ssl_expiry_days
            warn_d = th_obj.warn_days_remaining
            crit_d = th_obj.critical_days_remaining
            if days is None:
                status = "pending"
                summary = "No SSL data yet"
            elif days < 0:
                status = "critical"
                summary = "Certificate expired"
                last_value = str(days)
            elif days <= crit_d:
                status = "critical"
                summary = f"{days} days remaining"
                last_value = str(days)
            elif days <= warn_d:
                status = "warning"
                summary = f"{days} days remaining"
                last_value = str(days)
            else:
                status = "healthy"
                summary = f"{days} days remaining"
                last_value = str(days)
        else:
            status = "pending"
            summary = "Coming soon"

        out.append(
            CapabilityStatusSummary(
                capability=cap,
                status=status,
                last_check_at=last_at,
                last_value=last_value,
                summary=summary,
            )
        )

    return out


def _monitor_to_response(
    m: Monitor,
    content_extra: dict[str, Any] | None = None,
    latest_ssl_check: MonitorCheck | None = None,
) -> MonitorResponse:
    enabled_norm, caps_norm = _capabilities_for_api(m)
    return MonitorResponse(
        id=str(m.id),
        display_name=m.display_name,
        url=m.url,
        enabled_capabilities=enabled_norm,
        capabilities=caps_norm,
        capability_statuses=_compute_capability_statuses(
            m,
            enabled_norm,
            caps_norm,
            content_extra=content_extra,
            latest_ssl_check=latest_ssl_check,
        ),
        interval_seconds=m.interval_seconds,
        http_method=m.http_method,
        expected_status_code=m.expected_status_code,
        is_enabled=m.is_enabled,
        status=m.status.value,
        last_check_at=m.last_check_at,
        last_status_code=m.last_status_code,
        last_response_time_ms=m.last_response_time_ms,
        last_change_detected_at=m.last_change_detected_at,
        ssl_expiry_days=m.ssl_expiry_days,
        total_checks=m.total_checks,
        consecutive_failures=m.consecutive_failures,
        uptime_percentage=m.uptime_percentage,
        avg_response_time_ms=m.avg_response_time_ms,
        last_success=m.last_success,
        tags=list(m.tags or []),
        created_at=m.created_at,
        updated_at=m.updated_at,
    )


def _check_to_response(c: MonitorCheck) -> MonitorCheckResponse:
    ev = list(c.evaluated_capabilities) if c.evaluated_capabilities else []
    return MonitorCheckResponse(
        id=str(c.id),
        monitor_id=str(c.monitor_id),
        checked_at=c.checked_at,
        success=c.success,
        status_code=c.status_code,
        response_time_ms=c.response_time_ms,
        error_type=_error_type_to_api_label(c.error_type),
        error_message=c.error_message,
        content_hash=c.content_hash,
        content_changed=c.content_changed,
        snapshot_id=str(c.snapshot_id) if c.snapshot_id else None,
        ssl_days_remaining=c.ssl_days_remaining,
        evaluated_capabilities=ev,
    )


def _change_to_response(
    ch: MonitorChange,
    *,
    linked_visual_capture_id: str | None = None,
    linked_visual_correlation: CorrelationMethod | None = None,
) -> MonitorChangeResponse:
    ds = _normalize_diff_summary_for_api(ch.diff_summary if isinstance(ch.diff_summary, dict) else {})
    return MonitorChangeResponse(
        id=str(ch.id),
        monitor_id=str(ch.monitor_id),
        detected_at=ch.detected_at,
        previous_snapshot_id=str(ch.previous_snapshot_id) if ch.previous_snapshot_id else None,
        current_snapshot_id=str(ch.current_snapshot_id) if ch.current_snapshot_id else None,
        diff_summary=ds,
        change_size_bytes=int(ch.change_size_bytes or 0),
        previous_hash=ch.previous_hash,
        current_hash=ch.current_hash,
        linked_visual_capture_id=linked_visual_capture_id,
        linked_visual_correlation=linked_visual_correlation,
    )


async def _count_user_monitors(user_id: int, db: AsyncSession) -> int:
    q = select(func.count()).select_from(Monitor).where(Monitor.user_id == user_id)
    return int(await db.scalar(q) or 0)


async def create_monitor(
    user_id: int,
    data: MonitorCreateRequest,
    db: AsyncSession,
) -> MonitorResponse:
    if await _count_user_monitors(user_id, db) >= settings.MAX_MONITORS_PER_USER:
        raise ValidationError(code="MONITOR_LIMIT", message="Maximum monitors reached")

    try:
        validate_url_safety(str(data.url))
    except ValueError as exc:
        raise ValidationError(code="MONITOR_URL_BLOCKED", message=str(exc)) from exc

    caps = capabilities_from_enabled_list(list(data.enabled_capabilities))
    if data.capabilities:
        caps = merge_capability_dict(caps, dump_capabilities_patch(data.capabilities))
    caps = validate_capabilities_config(caps)

    monitor = Monitor(
        user_id=user_id,
        display_name=data.display_name,
        url=str(data.url),
        enabled_capabilities=list(data.enabled_capabilities),
        capabilities=caps,
        interval_seconds=data.interval_seconds,
        http_method=data.http_method,
        expected_status_code=data.expected_status_code,
        tags=data.tags,
        status=MonitorStatus.PENDING,
    )
    db.add(monitor)
    await db.flush()
    await db.refresh(monitor)
    logger.info("monitor_created", monitor_id=str(monitor.id))
    await _validate_selector_extraction_if_needed(monitor, db)
    return _monitor_to_response(monitor)


async def list_monitors(
    user_id: int,
    status: str | None,
    search: str | None,
    page: int,
    limit: int,
    db: AsyncSession,
) -> tuple[list[MonitorResponse], dict[str, int]]:
    filters = [Monitor.user_id == user_id]
    if status:
        try:
            st = MonitorStatus(status)
            filters.append(Monitor.status == st)
        except ValueError:
            pass
    if search and search.strip():
        term = f"%{search.strip()}%"
        filters.append(
            or_(Monitor.display_name.ilike(term), Monitor.url.ilike(term))
        )

    base = select(Monitor).where(and_(*filters)).order_by(Monitor.created_at.desc())
    count_stmt = select(func.count()).select_from(Monitor).where(and_(*filters))
    total = int(await db.scalar(count_stmt) or 0)

    offset = (page - 1) * limit
    result = await db.execute(base.offset(offset).limit(limit))
    rows = result.scalars().all()
    meta = {"page": page, "limit": limit, "total": total}
    return [_monitor_to_response(m) for m in rows], meta


async def get_monitor(monitor_id: uuid.UUID, user_id: int, db: AsyncSession) -> MonitorResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    extra: dict[str, Any] | None = None
    if "content_change" in (m.enabled_capabilities or []):
        extra = await _fetch_content_capability_extra(monitor_id, db)
    latest_ssl: MonitorCheck | None = None
    if "ssl_expiry" in (m.enabled_capabilities or []):
        latest_ssl = await _get_latest_ssl_check(monitor_id, db)
    return _monitor_to_response(m, content_extra=extra, latest_ssl_check=latest_ssl)


async def update_monitor(
    monitor_id: uuid.UUID,
    user_id: int,
    data: MonitorUpdateRequest,
    db: AsyncSession,
) -> MonitorResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")

    payload = data.model_dump(exclude_unset=True)
    capability_patch = dump_capabilities_patch(data.capabilities)
    if "url" in payload and payload["url"] is not None:
        try:
            validate_url_safety(str(payload["url"]))
        except ValueError as exc:
            raise ValidationError(code="MONITOR_URL_BLOCKED", message=str(exc)) from exc
        payload["url"] = str(payload["url"])
    for field in ("display_name", "interval_seconds", "http_method", "expected_status_code", "tags"):
        if field in payload:
            setattr(m, field, payload[field])
    if "url" in payload:
        m.url = payload["url"]
    if "enabled_capabilities" in payload and payload["enabled_capabilities"] is not None:
        m.enabled_capabilities = list(payload["enabled_capabilities"])
        fresh = capabilities_from_enabled_list(m.enabled_capabilities)
        prev = _capabilities_record_from_orm(m.capabilities)
        for k in CAPABILITY_KEYS:
            if k in prev and isinstance(prev[k], dict):
                po = prev[k]
                po_al = po.get("alert")
                if isinstance(po_al, dict):
                    fresh[k]["alert"] = {**fresh[k]["alert"], **po_al}
                po_th = po.get("thresholds")
                if isinstance(po_th, dict):
                    fresh[k]["thresholds"] = {**fresh[k]["thresholds"], **po_th}
                if po.get("intervalOverrideSeconds") is not None:
                    fresh[k]["intervalOverrideSeconds"] = po.get("intervalOverrideSeconds")
        m.capabilities = fresh
    if capability_patch:
        m.capabilities = merge_capability_dict(
            _capabilities_record_from_orm(m.capabilities),
            capability_patch,
        )
    _sync_capability_enabled_flags(m)
    m.capabilities = validate_capabilities_config(
        merge_capability_dict(
            capabilities_from_enabled_list(list(m.enabled_capabilities or [])),
            _capabilities_record_from_orm(m.capabilities),
        )
    )
    if "is_enabled" in payload and payload["is_enabled"] is not None:
        m.is_enabled = payload["is_enabled"]
        if not m.is_enabled:
            m.status = MonitorStatus.PAUSED
        elif m.status == MonitorStatus.PAUSED:
            m.status = MonitorStatus.PENDING

    await _validate_selector_extraction_if_needed(m, db)
    await db.flush()
    await db.refresh(m)
    return _monitor_to_response(m)


async def delete_monitor(monitor_id: uuid.UUID, user_id: int, db: AsyncSession) -> None:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    await db.delete(m)


def _normalize_diff_summary_for_api(raw: dict | None) -> dict[str, int | str]:
    """Ensure diff_summary includes keys expected by clients (legacy rows)."""
    s = raw or {}
    lines_added = int(s.get("linesAdded", 0))
    lines_removed = int(s.get("linesRemoved", 0))
    lines_changed = int(s.get("linesChanged", 0))
    total = int(s.get("totalDiffLines", lines_added + lines_removed))
    cat = str(s.get("changeCategory", "small"))
    out: dict[str, int | str] = {
        "linesAdded": lines_added,
        "linesRemoved": lines_removed,
        "linesChanged": lines_changed,
        "totalDiffLines": total,
        "changeCategory": cat,
    }
    dfp = s.get("diffFingerprint")
    if isinstance(dfp, str) and dfp:
        out["diffFingerprint"] = dfp
    return out


async def _fetch_content_capability_extra(
    monitor_id: uuid.UUID,
    db: AsyncSession,
) -> dict[str, Any]:
    """Counts and baseline age for content_change capability card."""
    now = datetime.now(timezone.utc)
    seven = now - timedelta(days=7)
    n7_stmt = select(func.count()).select_from(MonitorChange).where(
        MonitorChange.monitor_id == monitor_id,
        MonitorChange.detected_at >= seven,
    )
    n7 = int(await db.scalar(n7_stmt) or 0)
    base_stmt = (
        select(MonitorSnapshot)
        .where(
            MonitorSnapshot.monitor_id == monitor_id,
            MonitorSnapshot.is_baseline.is_(True),
        )
        .order_by(MonitorSnapshot.captured_at.desc())
        .limit(1)
    )
    base = (await db.execute(base_stmt)).scalar_one_or_none()
    if base is None:
        legacy_stmt = (
            select(MonitorSnapshot)
            .where(MonitorSnapshot.monitor_id == monitor_id)
            .order_by(MonitorSnapshot.captured_at.asc())
            .limit(1)
        )
        base = (await db.execute(legacy_stmt)).scalar_one_or_none()
    base_age: int | None = None
    if base is not None:
        cap_at = base.captured_at
        if cap_at.tzinfo is None:
            cap_at = cap_at.replace(tzinfo=timezone.utc)
        base_age = max(0, int((now - cap_at).total_seconds() // 86400))
    return {"changes_7d": n7, "baseline_age_days": base_age}


async def _validate_selector_extraction_if_needed(
    monitor: Monitor,
    db: AsyncSession,
) -> None:
    """422 when selectors are invalid or extraction empty (save-time dry-run)."""
    cfg = get_selector_extraction_config(monitor.capabilities)
    if not cfg:
        return
    if "content_change" not in set(monitor.enabled_capabilities or []):
        return
    q_prev = (
        select(MonitorSnapshot)
        .where(MonitorSnapshot.monitor_id == monitor.id)
        .order_by(MonitorSnapshot.captured_at.desc())
        .limit(1)
    )
    snap = (await db.execute(q_prev)).scalar_one_or_none()
    html: str
    if snap and snap.content:
        html = snap.content
    else:
        validate_url_safety(str(monitor.url))
        async with httpx.AsyncClient(
            timeout=settings.MONITOR_REQUEST_TIMEOUT_S,
            follow_redirects=True,
            max_redirects=5,
        ) as client:
            r = await client.get(
                str(monitor.url),
                headers={"User-Agent": settings.MONITOR_PROBE_USER_AGENT},
            )
            if r.status_code >= 400:
                raise ValidationError(
                    code="SELECTOR_PROBE_HTTP",
                    message=f"Probe HTTP status {r.status_code}",
                )
            html = r.text
    raw = html.encode("utf-8", errors="replace")
    if len(raw) > settings.MONITOR_MAX_BODY_BYTES:
        raise ValidationError(
            code="SELECTOR_PROBE_TOO_LARGE",
            message="Probe response exceeds MONITOR_MAX_BODY_BYTES",
        )
    try:
        validate_selectors_against_html(html, cfg.selectors, max_chars=cfg.max_extracted_chars)
    except SelectorValidationError as exc:
        raise ValidationError(code=exc.code, message=str(exc)) from exc


async def _run_content_change_capture(
    monitor: Monitor,
    response: httpx.Response,
    check: MonitorCheck,
    db: AsyncSession,
    redis: Redis | None,
) -> None:
    """
    Store snapshot / change rows when content_change is enabled and probe succeeded.

    Mutates ``check`` and ``monitor``; may flip ``check.success`` on validation errors.
    """
    try:
        validate_content_response(response)
    except ValueError as exc:
        check.success = False
        check.error_type = CheckErrorType.HTTP_ERROR
        check.error_message = str(exc)[:500]
        return

    body_raw = response.text
    raw = body_raw.encode("utf-8", errors="replace")
    max_b = settings.MONITOR_MAX_BODY_BYTES
    if len(raw) > max_b:
        check.success = False
        check.error_type = CheckErrorType.CONTENT_TOO_LARGE
        check.error_message = "Response body exceeds maximum allowed size"
        return

    sel_cfg = get_selector_extraction_config(monitor.capabilities)
    new_text = extract_for_content_pipeline(body_raw, sel_cfg)

    content_type = response.headers.get("content-type", "") or ""
    charset = extract_charset(content_type, response)
    thresholds = get_content_thresholds(monitor.capabilities)
    normalize_on = (
        settings.CONTENT_NORMALIZATION_ENABLED and thresholds.normalize_volatile_tokens
    )
    custom_rules: list[tuple[re.Pattern[str], str]] | None = None
    if normalize_on and settings.CONTENT_CUSTOM_NORMALIZATION_RULES_ENABLED:
        rules = compile_custom_normalization_rules(monitor.capabilities)
        custom_rules = rules if rules else None
    ext_body = settings.CONTENT_EXTENDED_VOLATILE_NORMALIZATION_ENABLED
    fp = compute_content_fingerprint(
        new_text,
        normalize=normalize_on,
        custom_rules=custom_rules,
        apply_extended_volatile=ext_body,
    )
    norm_ver = 1 if normalize_on else 0

    if monitor.last_content_hash is None:
        db.add(check)
        await db.flush()
        snap = MonitorSnapshot(
            monitor_id=monitor.id,
            check_id=check.id,
            content_hash=fp,
            content_size_bytes=len(raw),
            content=body_raw,
            content_type=content_type or None,
            charset=charset,
            http_status_code=response.status_code,
            is_baseline=True,
            normalization_version=norm_ver,
        )
        db.add(snap)
        await db.flush()
        check.content_hash = fp
        check.snapshot_id = snap.id
        monitor.last_content_hash = fp
        return

    if fp == monitor.last_content_hash:
        check.content_hash = fp
        return

    q_prev = (
        select(MonitorSnapshot)
        .where(MonitorSnapshot.monitor_id == monitor.id)
        .order_by(MonitorSnapshot.captured_at.desc())
        .limit(1)
    )
    prev_snap = (await db.execute(q_prev)).scalar_one_or_none()

    if prev_snap is None:
        logger.warning("previous_snapshot_missing", monitor_id=str(monitor.id))
        db.add(check)
        await db.flush()
        snap = MonitorSnapshot(
            monitor_id=monitor.id,
            check_id=check.id,
            content_hash=fp,
            content_size_bytes=len(raw),
            content=body_raw,
            content_type=content_type or None,
            charset=charset,
            http_status_code=response.status_code,
            is_baseline=True,
            normalization_version=norm_ver,
        )
        db.add(snap)
        await db.flush()
        check.content_hash = fp
        check.snapshot_id = snap.id
        monitor.last_content_hash = fp
        return

    prev_text = extract_for_content_pipeline(prev_snap.content, sel_cfg)

    # Degraded / bot-check HTML: do not create MonitorChange rows (avoids timeline spam).
    if thresholds.suppress_degraded_page_changes:
        degraded, deg_reason = detect_degraded_page(body_raw)
        if degraded:
            logger.info(
                "content_change_suppressed_noise",
                monitor_id=str(monitor.id),
                user_id=monitor.user_id,
                noise_suppression="degraded_page",
                reason=deg_reason,
            )
            inc_suppressed("degraded_page")
            check.content_hash = fp
            monitor.last_content_hash = fp
            return

    # Raw hash differed but normalized bodies match (e.g. UUID token rotation only).
    if normalize_on and (
        normalize_body_for_comparison(
            new_text,
            custom_rules=custom_rules,
            apply_extended_volatile=ext_body,
        )
        == normalize_body_for_comparison(
            prev_text,
            custom_rules=custom_rules,
            apply_extended_volatile=ext_body,
        )
    ):
        logger.info(
            "content_change_suppressed_noise",
            monitor_id=str(monitor.id),
            user_id=monitor.user_id,
            noise_suppression="normalized_equal",
        )
        inc_suppressed("normalized_equal")
        check.content_hash = fp
        monitor.last_content_hash = fp
        return

    diff_summary = compute_diff_summary(prev_text, new_text)
    change_size = abs(len(raw) - prev_snap.content_size_bytes)
    met = evaluate_content_threshold(diff_summary, change_size, thresholds)

    if not met:
        logger.info(
            "content_change_below_threshold",
            monitor_id=str(monitor.id),
            user_id=monitor.user_id,
            total_diff_lines=diff_summary.get("totalDiffLines"),
            change_size_bytes=change_size,
        )
        inc_below_threshold()
        check.content_hash = fp
        monitor.last_content_hash = fp
        return

    diff_fp = compute_unified_diff_fingerprint(
        prev_text,
        new_text,
        custom_rules=custom_rules,
        apply_extended_body_norm=ext_body,
    )
    diff_summary["diffFingerprint"] = diff_fp

    db.add(check)
    await db.flush()
    snap = MonitorSnapshot(
        monitor_id=monitor.id,
        check_id=check.id,
        content_hash=fp,
        content_size_bytes=len(raw),
        content=body_raw,
        content_type=content_type or None,
        charset=charset,
        http_status_code=response.status_code,
        is_baseline=False,
        normalization_version=norm_ver,
    )
    db.add(snap)
    await db.flush()
    check.content_hash = fp
    check.snapshot_id = snap.id
    check.content_changed = True

    ch = MonitorChange(
        monitor_id=monitor.id,
        previous_snapshot_id=prev_snap.id,
        current_snapshot_id=snap.id,
        diff_summary=diff_summary,
        change_size_bytes=change_size,
        previous_hash=monitor.last_content_hash,
        current_hash=fp,
        threshold_met=True,
    )
    db.add(ch)
    await db.flush()

    monitor.last_content_hash = fp
    ch_detected_at = ch.detected_at or datetime.now(timezone.utc)
    monitor.last_change_detected_at = ch_detected_at
    monitor.total_changes_detected = (monitor.total_changes_detected or 0) + 1

    alert_st = get_content_alert_suppression_settings(monitor.capabilities)
    prev_same_stmt = (
        select(MonitorChange)
        .where(
            MonitorChange.monitor_id == monitor.id,
            MonitorChange.diff_summary["diffFingerprint"].astext == diff_fp,
            MonitorChange.id != ch.id,
        )
        .order_by(MonitorChange.detected_at.desc(), MonitorChange.id.desc())
        .limit(1)
    )
    prev_same = (await db.execute(prev_same_stmt)).scalar_one_or_none()
    prev_same_at = prev_same.detected_at if prev_same else None

    prior_dispatched = 0
    if (
        alert_st.repeat_max_notifications_per_fingerprint is not None
        and alert_st.repeat_max_notifications_window_minutes is not None
    ):
        cutoff = ch_detected_at - timedelta(
            minutes=alert_st.repeat_max_notifications_window_minutes
        )
        cnt_q = select(func.count()).select_from(MonitorChange).where(
            MonitorChange.monitor_id == monitor.id,
            MonitorChange.diff_summary["diffFingerprint"].astext == diff_fp,
            MonitorChange.detected_at >= cutoff,
            MonitorChange.id != ch.id,
            or_(
                MonitorChange.notification_dispatched.is_(True),
                MonitorChange.notification_dispatched.is_(None),
            ),
        )
        prior_dispatched = int(await db.scalar(cnt_q) or 0)

    dispatch, suppress_reason = decide_content_change_notification(
        change_category=str(diff_summary.get("changeCategory", "small")),
        diff_fingerprint=diff_fp,
        settings_obj=alert_st,
        now=ch_detected_at,
        prev_same_fingerprint_at=prev_same_at,
        prior_dispatched_same_fp_in_window=prior_dispatched,
    )
    ch.notification_dispatched = dispatch
    await db.flush()

    logger.info(
        "content_change_detected",
        monitor_id=str(monitor.id),
        user_id=monitor.user_id,
        url=str(monitor.url),
        previous_hash=ch.previous_hash,
        current_hash=ch.current_hash,
        change_size_bytes=change_size,
        total_diff_lines=diff_summary.get("totalDiffLines"),
        change_category=diff_summary.get("changeCategory"),
        threshold_met=True,
        change_id=str(ch.id),
        notification_dispatched=dispatch,
    )
    inc_detected()

    if dispatch:
        content_category = str(diff_summary.get("changeCategory", "small"))
        content_severity = "warning" if content_category in {"medium", "large"} else "info"
        await alert_service.evaluate_and_dispatch_alert(
            monitor,
            "content_change",
            "content_change",
            content_severity,
            f"diffLines:{diff_summary.get('totalDiffLines', 0)}",
            f"Content changed ({content_category})",
            db,
            redis,
            threshold_config=copy.deepcopy(thresholds.__dict__),
        )
        await _publish_monitor_event(
            redis,
            monitor.id,
            monitor.user_id,
            "content_changed",
            {
                "changeId": str(ch.id),
                "detectedAt": ch_detected_at.isoformat(),
                "diffSummary": diff_summary,
                "previousHash": ch.previous_hash,
                "currentHash": ch.current_hash,
            },
            dispatch_webhook=False,
        )
    else:
        await alert_service.evaluate_and_dispatch_alert(
            monitor,
            "content_change",
            "content_change",
            "info",
            f"diffLines:{diff_summary.get('totalDiffLines', 0)}",
            "Content change suppressed by alert policy",
            db,
            redis,
            threshold_config=copy.deepcopy(thresholds.__dict__),
            extra_suppression_reason=suppress_reason or "content_repeat",
        )
        logger.info(
            "content_change_alert_suppressed",
            monitor_id=str(monitor.id),
            user_id=monitor.user_id,
            change_id=str(ch.id),
            diff_fingerprint_prefix=diff_fingerprint_prefix(diff_fp),
            suppress_reason=suppress_reason,
            rule="alert_policy",
        )
        if suppress_reason:
            inc_alert_suppressed(suppress_reason)


async def _run_visual_change_capture(
    monitor: Monitor,
    check: MonitorCheck,
    db: AsyncSession,
    redis: Redis | None,
) -> None:
    """Store PNG capture and optional MonitorVisualChange when dHash similarity drops."""
    vth = get_visual_thresholds(monitor.capabilities)
    try:
        payload = await call_screenshot_service(
            str(monitor.url),
            viewport_width=vth.viewport_width,
            viewport_height=vth.viewport_height,
            full_page=vth.full_page,
        )
    except httpx.HTTPError as exc:
        logger.warning(
            "visual_screenshot_http_error",
            monitor_id=str(monitor.id),
            error=str(exc)[:400],
        )
        return
    except Exception as exc:
        logger.warning(
            "visual_screenshot_unexpected",
            monitor_id=str(monitor.id),
            error=str(exc)[:400],
        )
        return

    decoded = decode_screenshot_payload(payload)
    if decoded is None:
        return
    png_bytes, w_px, h_px = decoded
    try:
        phash = await asyncio.to_thread(compute_dhash_hex, png_bytes)
    except Exception as exc:
        logger.warning(
            "visual_dhash_failed",
            monitor_id=str(monitor.id),
            error=str(exc)[:300],
        )
        return

    q_prev = (
        select(MonitorVisualCapture)
        .where(MonitorVisualCapture.monitor_id == monitor.id)
        .order_by(MonitorVisualCapture.captured_at.desc())
        .limit(1)
    )
    prev = (await db.execute(q_prev)).scalar_one_or_none()

    cap = MonitorVisualCapture(
        monitor_id=monitor.id,
        check_id=check.id,
        image_png=png_bytes,
        width_px=w_px,
        height_px=h_px,
        viewport_width=vth.viewport_width,
        viewport_height=vth.viewport_height,
        full_page=vth.full_page,
        perceptual_hash_hex=phash,
        dhash_algo="dhash",
    )
    db.add(cap)
    await db.flush()

    if prev is None or not prev.perceptual_hash_hex:
        return

    try:
        ham = hamming_between_hex(prev.perceptual_hash_hex, phash)
    except (ValueError, TypeError):
        ham = DHASH_BIT_LENGTH
    sim = similarity_percent_from_hamming(ham)

    if not is_visual_change_detected(sim, vth.similarity_threshold_percent):
        return

    summary: dict[str, Any] = {
        "hammingDistance": ham,
        "similarityPercent": sim,
        "perceptualHashAlgo": "dhash",
        "similarityThresholdPercent": vth.similarity_threshold_percent,
    }
    vch = MonitorVisualChange(
        monitor_id=monitor.id,
        previous_capture_id=prev.id,
        current_capture_id=cap.id,
        diff_summary=summary,
    )
    db.add(vch)
    await db.flush()
    det_at = vch.detected_at or datetime.now(timezone.utc)
    await alert_service.evaluate_and_dispatch_alert(
        monitor,
        "visual_change",
        "visual_change",
        "warning",
        f"similarity:{sim:.2f}",
        "Visual similarity dropped below threshold",
        db,
        redis,
        threshold_config=copy.deepcopy(vth.__dict__),
    )
    await _publish_monitor_event(
        redis,
        monitor.id,
        monitor.user_id,
        "visual_changed",
        {
            "visualChangeId": str(vch.id),
            "detectedAt": det_at.isoformat(),
            "diffSummary": summary,
        },
        dispatch_webhook=False,
    )


async def execute_check(
    monitor_id: uuid.UUID,
    db: AsyncSession,
    redis: Redis | None = None,
) -> MonitorCheck | None:
    monitor = await db.get(Monitor, monitor_id)
    if not monitor or not monitor.is_enabled:
        return None

    old_status = monitor.status
    thresholds = _parse_uptime_thresholds(monitor)
    enabled = set(monitor.enabled_capabilities or [])
    evaluated: list[str] = []

    check = MonitorCheck(
        monitor_id=monitor_id,
        success=False,
        response_time_ms=0.0,
        content_changed=False,
        evaluated_capabilities=[],
    )

    run_http = (
        "uptime_only" in enabled
        or "content_change" in enabled
        or "visual_change" in enabled
    )
    method = monitor.http_method.upper()
    if "content_change" in enabled and method == "HEAD":
        check.error_type = CheckErrorType.UNKNOWN
        check.error_message = (
            "content_change capability is incompatible with HTTP method HEAD; "
            "use GET or POST."
        )
        check.success = False
        run_http = False
    elif "content_change" in enabled and method in _BODY_BEARING_METHODS:
        # Monitor model has no http_body column yet; surface the gap for
        # operators so they understand POST/PUT/PATCH content-change probes
        # currently send an empty request body.
        logger.warning(
            "monitor_content_change_with_method_lacks_body",
            monitor_id=str(monitor.id),
            method=method,
        )

    try:
        validate_url_safety(monitor.url)
    except ValueError as exc:
        check.error_type = CheckErrorType.UNKNOWN
        check.error_message = str(exc)[:500]
        check.success = False
        run_http = False

    if run_http:
        headers = {"User-Agent": settings.MONITOR_PROBE_USER_AGENT}
        try:
            async with httpx.AsyncClient(
                timeout=settings.MONITOR_REQUEST_TIMEOUT_S,
                follow_redirects=True,
                max_redirects=5,
            ) as client:
                t0 = datetime.now(timezone.utc)
                if "content_change" in enabled:
                    # TODO(monitor-http-body): once Monitor.http_body column is
                    # added, pass `content=monitor.http_body` here for POST/PUT.
                    # Until then POST/PUT/PATCH send an empty body (a WARNING
                    # log is emitted above to flag this gap to operators).
                    response = await client.request(method, monitor.url, headers=headers)
                    elapsed_ms = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
                    check.status_code = response.status_code
                    check.response_time_ms = elapsed_ms
                    check.success = _evaluate_probe_success(
                        response.status_code,
                        monitor.expected_status_code,
                    )
                    if check.success:
                        await _run_content_change_capture(
                            monitor, response, check, db, redis
                        )
                else:
                    async with client.stream(method, monitor.url, headers=headers) as response:
                        check.status_code = response.status_code
                        read_bytes = 0
                        async for chunk in response.aiter_bytes():
                            read_bytes += len(chunk)
                            if read_bytes >= settings.MONITOR_PROBE_MAX_BODY_BYTES:
                                await response.aclose()
                                break
                        elapsed_ms = (datetime.now(timezone.utc) - t0).total_seconds() * 1000
                        check.response_time_ms = elapsed_ms
                        check.success = _evaluate_probe_success(
                            response.status_code,
                            monitor.expected_status_code,
                        )

        except httpx.TimeoutException:
            check.error_type = CheckErrorType.TIMEOUT
            check.error_message = "Request timed out"
        except httpx.ConnectError as exc:
            msg = str(exc).lower()
            if "name or service not known" in msg or "nodename nor servname" in msg:
                check.error_type = CheckErrorType.DNS_RESOLUTION
            else:
                check.error_type = CheckErrorType.CONNECTION_REFUSED
            check.error_message = str(exc)[:500]
        except ssl.SSLError as exc:
            check.error_type = CheckErrorType.SSL_ERROR
            check.error_message = str(exc)[:500]
        except httpx.RequestError as exc:
            check.error_type = CheckErrorType.UNKNOWN
            check.error_message = str(exc)[:500]

        if "uptime_only" in enabled:
            evaluated.append("uptime_only")
        if "content_change" in enabled:
            evaluated.append("content_change")
    else:
        if check.error_message is None:
            check.success = True
            check.response_time_ms = 0.0

    if check.id is None:
        db.add(check)
        await db.flush()

    ssl_result = None
    if "ssl_expiry" in enabled:
        evaluated.append("ssl_expiry")
        if _is_https(monitor.url):
            try:
                hostname, port = extract_host_port(monitor.url)
                ssl_result = await probe_ssl_async(
                    hostname, port, timeout=settings.SSL_PROBE_TIMEOUT_SECONDS
                )
            except Exception as exc:
                logger.warning(
                    "ssl_probe_exception_in_check",
                    monitor_id=str(monitor.id),
                    error=str(exc),
                )
        if ssl_result is not None:
            check.ssl_snapshot = ssl_result.to_dict()
            if ssl_result.success:
                check.ssl_days_remaining = ssl_result.days_remaining
                ssl_th = _ssl_thresholds_from_config(monitor.capabilities.get("ssl_expiry", {}))
                old_days = monitor.ssl_expiry_days
                old_expired = old_days is not None and old_days < 0
                old_severity = _evaluate_ssl_severity(old_days, old_expired, ssl_th)
                monitor.ssl_expiry_days = ssl_result.days_remaining
                monitor.last_ssl_probe_at = datetime.now(timezone.utc)
                new_severity = _evaluate_ssl_severity(
                    ssl_result.days_remaining,
                    ssl_result.is_expired,
                    ssl_th,
                )
                if new_severity in {"warning", "critical"}:
                    await alert_service.evaluate_and_dispatch_alert(
                        monitor,
                        "ssl_expiry",
                        "ssl_critical" if new_severity == "critical" else "ssl_warning",
                        "critical" if new_severity == "critical" else "warning",
                        f"daysRemaining:{ssl_result.days_remaining}",
                        (
                            "SSL certificate expired or is critically close to expiry"
                            if new_severity == "critical"
                            else "SSL certificate is nearing expiry"
                        ),
                        db,
                        redis,
                        threshold_config=copy.deepcopy(ssl_th.__dict__),
                    )
                if old_severity != new_severity:
                    await _publish_monitor_event(
                        redis,
                        monitor.id,
                        monitor.user_id,
                        "ssl_threshold",
                        {
                            "previousSeverity": old_severity,
                            "currentSeverity": new_severity,
                            "daysRemaining": ssl_result.days_remaining,
                            "isExpired": ssl_result.is_expired,
                        },
                        dispatch_webhook=False,
                    )
                    logger.info(
                        "ssl_severity_changed",
                        monitor_id=str(monitor.id),
                        previous=old_severity,
                        current=new_severity,
                        days_remaining=ssl_result.days_remaining,
                    )
                logger.info(
                    "ssl_probe_completed",
                    monitor_id=str(monitor.id),
                    hostname=ssl_result.hostname,
                    port=ssl_result.port,
                    days_remaining=ssl_result.days_remaining,
                    is_expired=ssl_result.is_expired,
                    san_count=len(ssl_result.subject_alternative_names),
                    chain_depth=len(ssl_result.chain),
                    probe_time_ms=ssl_result.probe_time_ms,
                    severity=new_severity,
                )
            else:
                logger.warning(
                    "ssl_probe_failed",
                    monitor_id=str(monitor.id),
                    hostname=ssl_result.hostname,
                    port=ssl_result.port,
                    error_type=ssl_result.error_type,
                    error_message=ssl_result.error_message,
                    probe_time_ms=ssl_result.probe_time_ms,
                )

    # SSL-only mode: when the only enabled capability requires a probe outcome
    # (`ssl_expiry`) and no HTTP probe ran, `check.success` must reflect the SSL
    # probe outcome. Otherwise a failed handshake would silently look "up".
    ssl_only_mode = (
        not run_http
        and "ssl_expiry" in enabled
        and SSL_ONLY_PROBE_REQUIRED.issuperset(enabled)
    )
    if ssl_only_mode:
        if ssl_result is None:
            check.success = False
            if check.error_type is None:
                check.error_type = CheckErrorType.SSL_ERROR
            if check.error_message is None:
                check.error_message = "SSL probe could not complete"
        else:
            check.success = bool(ssl_result.success)
            if not ssl_result.success and check.error_type is None:
                check.error_type = CheckErrorType.SSL_ERROR
                check.error_message = (
                    ssl_result.error_message or "SSL probe failed"
                )[:500]

    if check.success and "visual_change" in enabled:
        if "visual_change" not in evaluated:
            evaluated.append("visual_change")
        await _run_visual_change_capture(monitor, check, db, redis)

    # If user paused while this check was running, read committed is_enabled without
    # refresh() (refresh would discard unflushed SSL / capability updates on monitor).
    still_enabled = await db.scalar(
        select(Monitor.is_enabled).where(Monitor.id == monitor_id)
    )
    if not still_enabled:
        await db.delete(check)
        await db.flush()
        return None

    check.evaluated_capabilities = evaluated

    monitor.last_check_at = check.checked_at
    monitor.total_checks = (monitor.total_checks or 0) + 1
    monitor.last_success = check.success

    is_degraded = False
    if run_http:
        max_ms = thresholds.max_response_time_ms
        if check.success and max_ms is not None and check.response_time_ms > max_ms:
            is_degraded = True

    if run_http or check.error_message or ssl_only_mode:
        if check.success and not check.error_type:
            monitor.consecutive_failures = 0
        elif not check.success:
            monitor.consecutive_failures = (monitor.consecutive_failures or 0) + 1

    if run_http or check.error_message or ssl_only_mode:
        if run_http:
            # last_status_code / last_response_time_ms describe the HTTP probe;
            # don't smear stale HTTP values when only the SSL probe ran.
            monitor.last_status_code = check.status_code
            monitor.last_response_time_ms = check.response_time_ms
        if monitor.is_enabled:
            if ssl_only_mode and check.success and "ssl_expiry" in enabled:
                # Probe succeeded — defer to SSL severity-driven status so
                # near-expiry certs report DEGRADED rather than UP.
                ssl_th = _ssl_thresholds_from_config(
                    monitor.capabilities.get("ssl_expiry", {})
                )
                warn_d = ssl_th.warn_days_remaining
                crit_d = ssl_th.critical_days_remaining
                days = monitor.ssl_expiry_days
                if days is not None:
                    if days < 0:
                        monitor.status = MonitorStatus.DOWN
                    elif days <= crit_d or days <= warn_d:
                        monitor.status = MonitorStatus.DEGRADED
                    else:
                        monitor.status = MonitorStatus.UP
            else:
                monitor.status = _determine_status(
                    success=check.success,
                    is_degraded=is_degraded,
                    consecutive_failures=monitor.consecutive_failures or 0,
                    threshold_consecutive=thresholds.consecutive_failures,
                )
    elif monitor.is_enabled and "ssl_expiry" in enabled:
        ssl_th = _ssl_thresholds_from_config(monitor.capabilities.get("ssl_expiry", {}))
        warn_d = ssl_th.warn_days_remaining
        crit_d = ssl_th.critical_days_remaining
        days = monitor.ssl_expiry_days
        if days is not None:
            if days < 0:
                monitor.status = MonitorStatus.DOWN
            elif days <= crit_d:
                monitor.status = MonitorStatus.DEGRADED
            elif days <= warn_d:
                monitor.status = MonitorStatus.DEGRADED
            else:
                monitor.status = MonitorStatus.UP

    uptime_threshold_snapshot = {}
    if isinstance(monitor.capabilities, dict):
        uptime_cfg = monitor.capabilities.get("uptime_only")
        if isinstance(uptime_cfg, dict) and isinstance(uptime_cfg.get("thresholds"), dict):
            uptime_threshold_snapshot = copy.deepcopy(uptime_cfg["thresholds"])

    if run_http and "uptime_only" in enabled:
        if check.success and is_degraded and thresholds.max_response_time_ms is not None:
            await alert_service.evaluate_and_dispatch_alert(
                monitor,
                "uptime_only",
                "threshold_breach",
                "warning",
                f"responseTime:{int(check.response_time_ms)}ms",
                "Response time exceeded the configured threshold",
                db,
                redis,
                threshold_config=uptime_threshold_snapshot,
            )
        if (
            not check.success
            and (monitor.consecutive_failures or 0) >= thresholds.consecutive_failures
        ):
            await alert_service.evaluate_and_dispatch_alert(
                monitor,
                "uptime_only",
                "downtime",
                "critical",
                f"consecutiveFailures:{monitor.consecutive_failures or 0}",
                "Monitor is considered down after consecutive failures",
                db,
                redis,
                threshold_config=uptime_threshold_snapshot,
            )
        elif (
            not check.success
            and thresholds.alert_on_unexpected_status
            and check.status_code is not None
        ):
            await alert_service.evaluate_and_dispatch_alert(
                monitor,
                "uptime_only",
                "unexpected_status",
                "warning",
                f"statusCode:{check.status_code}",
                "HTTP status code did not match the expected success criteria",
                db,
                redis,
                threshold_config=uptime_threshold_snapshot,
            )

    await _recompute_rolling_stats(monitor, db)
    await db.flush()

    new_status = monitor.status
    status_transition = (
        f"{old_status.value} → {new_status.value}" if old_status != new_status else None
    )
    logger.info(
        "monitor_check_completed",
        monitor_id=str(monitor_id),
        user_id=monitor.user_id,
        url=str(monitor.url),
        success=check.success,
        status_code=check.status_code,
        response_time_ms=check.response_time_ms,
        error_type=_error_type_to_api_label(check.error_type),
        status_transition=status_transition,
    )

    checked_at = check.checked_at or datetime.now(timezone.utc)
    check_payload: dict[str, Any] = {
        "check_id": str(check.id),
        "success": check.success,
        "status_code": check.status_code,
        "response_time_ms": check.response_time_ms,
        "checked_at": checked_at.isoformat(),
    }
    snap = check.ssl_snapshot
    if isinstance(snap, dict) and snap.get("success"):
        check_payload["days_remaining"] = snap.get("days_remaining")
        check_payload["chain_depth"] = len(snap.get("chain") or [])
        check_payload["san_count"] = len(snap.get("subject_alternative_names") or [])
    await _publish_monitor_event(
        redis, monitor_id, monitor.user_id, "check_completed", check_payload
    )
    if old_status != new_status:
        await _publish_monitor_event(
            redis,
            monitor_id,
            monitor.user_id,
            "status_changed",
            {
                "previous": old_status.value.upper(),
                "current": new_status.value.upper(),
                "changed_at": datetime.now(timezone.utc).isoformat(),
            },
        )

    return check


async def _recompute_rolling_stats(monitor: Monitor, db: AsyncSession) -> None:
    since = datetime.now(timezone.utc) - timedelta(days=30)
    q = select(MonitorCheck).where(
        MonitorCheck.monitor_id == monitor.id,
        MonitorCheck.checked_at >= since,
    )
    rows = (await db.execute(q)).scalars().all()
    if not rows:
        return
    ok = sum(1 for r in rows if r.success)
    monitor.uptime_percentage = round(100.0 * ok / len(rows), 3)
    latencies = [r.response_time_ms for r in rows if r.success and r.response_time_ms is not None]
    if latencies:
        monitor.avg_response_time_ms = sum(latencies) / len(latencies)


async def pause_monitor(
    monitor_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
) -> MonitorResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    m.is_enabled = False
    m.status = MonitorStatus.PAUSED
    await db.flush()
    await db.refresh(m)
    return _monitor_to_response(m)


async def resume_monitor(
    monitor_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
) -> MonitorResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    m.is_enabled = True
    if m.status == MonitorStatus.PAUSED:
        m.status = MonitorStatus.PENDING
    await db.flush()
    await db.refresh(m)
    return _monitor_to_response(m)


async def trigger_manual_check(
    monitor_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
    redis: Redis,
) -> MonitorCheckResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    cooldown_key = f"monitor:manual_check:{monitor_id}"
    if await redis.exists(cooldown_key):
        raise AppException(
            code="MONITOR_CHECK_COOLDOWN",
            message="Please wait before triggering another check",
            status_code=429,
        )
    await redis.setex(
        cooldown_key,
        settings.MONITOR_MANUAL_CHECK_COOLDOWN_SECONDS,
        "1",
    )
    row = await execute_check(monitor_id, db, redis=redis)
    if not row:
        raise ValidationError(code="MONITOR_DISABLED", message="Monitor is disabled")
    return _check_to_response(row)


async def get_checks(
    monitor_id: uuid.UUID,
    user_id: int,
    page: int,
    limit: int,
    db: AsyncSession,
    period: str | None = None,
    success: bool | None = None,
    sort: str = "desc",
) -> tuple[list[MonitorCheckResponse], dict[str, int]]:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")

    filters = [MonitorCheck.monitor_id == monitor_id]
    if period:
        delta = PERIOD_TO_DELTA.get(period, PERIOD_TO_DELTA["24h"])
        cutoff = datetime.now(timezone.utc) - delta
        filters.append(MonitorCheck.checked_at >= cutoff)
    if success is not None:
        filters.append(MonitorCheck.success == success)

    count_stmt = select(func.count()).select_from(MonitorCheck).where(and_(*filters))
    total = int(await db.scalar(count_stmt) or 0)
    offset = (page - 1) * limit
    order_col = MonitorCheck.checked_at.desc() if sort == "desc" else MonitorCheck.checked_at.asc()
    q = (
        select(MonitorCheck)
        .where(and_(*filters))
        .order_by(order_col)
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    meta = {"page": page, "limit": limit, "total": total}
    return [_check_to_response(c) for c in rows], meta


async def get_time_series(
    monitor_id: uuid.UUID,
    user_id: int,
    period: str,
    db: AsyncSession,
) -> MonitorTimeSeriesData:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    delta, step_sec = PERIOD_SERIES_CONFIG.get(period, PERIOD_SERIES_CONFIG["24h"])
    since = datetime.now(timezone.utc) - delta
    resolution = SERIES_RESOLUTION_LABEL.get(step_sec, f"{step_sec}s")
    stmt = text(
        """
        SELECT
          (to_timestamp(floor(extract(epoch from checked_at) / :step) * :step)
            AT TIME ZONE 'UTC') AS bucket_start,
          COUNT(*)::int AS check_count,
          CASE WHEN COUNT(*) = 0 THEN 0.0
               ELSE (SUM(CASE WHEN success THEN 1 ELSE 0 END)::float / COUNT(*)::float) * 100.0
          END AS success_rate,
          COALESCE(AVG(response_time_ms) FILTER (WHERE success), 0.0) AS avg_rt,
          COALESCE(MIN(response_time_ms) FILTER (WHERE success), 0.0) AS min_rt,
          COALESCE(MAX(response_time_ms) FILTER (WHERE success), 0.0) AS max_rt
        FROM osint_monitor_checks
        WHERE monitor_id = CAST(:mid AS uuid) AND checked_at >= :since
        GROUP BY 1
        ORDER BY 1 ASC
        """
    )
    result = await db.execute(
        stmt,
        {
            "step": step_sec,
            "mid": str(monitor_id),
            "since": since,
        },
    )
    points: list[MonitorTimeSeriesBucket] = []
    for row in result.mappings().all():
        ts = row["bucket_start"]
        if ts is None:
            continue
        if getattr(ts, "tzinfo", None) is None:
            ts = ts.replace(tzinfo=timezone.utc)
        points.append(
            MonitorTimeSeriesBucket(
                timestamp=ts,
                success_rate=float(row["success_rate"] or 0),
                avg_response_time=float(row["avg_rt"] or 0),
                min_response_time=float(row["min_rt"] or 0),
                max_response_time=float(row["max_rt"] or 0),
                check_count=int(row["check_count"] or 0),
            )
        )
    return MonitorTimeSeriesData(period=period, resolution=resolution, points=points)


def _p95(values: list[float]) -> float:
    if not values:
        return 0.0
    s = sorted(values)
    idx = min(len(s) - 1, max(0, math.ceil(0.95 * len(s)) - 1))
    return float(s[idx])


async def get_uptime_summary(
    monitor_id: uuid.UUID,
    user_id: int,
    period: str,
    db: AsyncSession,
) -> MonitorUptimeSummaryResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    delta = PERIOD_TO_DELTA.get(period, PERIOD_TO_DELTA["24h"])
    since = datetime.now(timezone.utc) - delta
    q = (
        select(MonitorCheck)
        .where(
            MonitorCheck.monitor_id == monitor_id,
            MonitorCheck.checked_at >= since,
        )
        .order_by(MonitorCheck.checked_at.asc())
    )
    rows = (await db.execute(q)).scalars().all()
    total = len(rows)
    ok = sum(1 for r in rows if r.success)
    failed = total - ok
    latencies = [r.response_time_ms for r in rows if r.success]
    successes = [bool(r.success) for r in rows]
    incidents = _count_incidents_from_successes(successes)
    uptime_pct = round(100.0 * ok / total, 2) if total else 0.0
    avg_lat = sum(latencies) / len(latencies) if latencies else 0.0
    streak = _current_streak_from_rows(rows)
    dist = _failure_distribution_counts(rows)
    return MonitorUptimeSummaryResponse(
        period=period,
        total_checks=total,
        successful_checks=ok,
        failed_checks=failed,
        uptime_percentage=uptime_pct,
        avg_response_time_ms=avg_lat,
        p95_response_time_ms=_p95(latencies),
        incidents=incidents,
        current_streak=streak,
        failure_distribution=dist,
    )


async def get_changes(
    monitor_id: uuid.UUID,
    user_id: int,
    page: int,
    limit: int,
    db: AsyncSession,
    period: str | None = None,
    category: str | None = None,
    sort: str = "desc",
) -> tuple[list[MonitorChangeResponse], dict[str, int]]:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    filters = [MonitorChange.monitor_id == monitor_id]
    if period:
        delta = PERIOD_TO_DELTA.get(period, PERIOD_TO_DELTA["24h"])
        cutoff = datetime.now(timezone.utc) - delta
        filters.append(MonitorChange.detected_at >= cutoff)
    if category and category in ("small", "medium", "large"):
        filters.append(
            MonitorChange.diff_summary.contains({"changeCategory": category})
        )
    count_stmt = select(func.count()).select_from(MonitorChange).where(and_(*filters))
    total = int(await db.scalar(count_stmt) or 0)
    offset = (page - 1) * limit
    order_col = (
        MonitorChange.detected_at.desc()
        if sort == "desc"
        else MonitorChange.detected_at.asc()
    )
    q = (
        select(MonitorChange)
        .where(and_(*filters))
        .order_by(order_col)
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    meta = {"page": page, "limit": limit, "total": total}
    link_map: dict[uuid.UUID, tuple[uuid.UUID | None, CorrelationMethod | None]] = {}
    if "visual_change" in set(m.enabled_capabilities or []):
        link_map = await resolve_linked_visual_captures_for_changes(m, list(rows), db)
    out: list[MonitorChangeResponse] = []
    for c in rows:
        cap_id, corr = link_map.get(c.id, (None, None))
        out.append(
            _change_to_response(
                c,
                linked_visual_capture_id=str(cap_id) if cap_id else None,
                linked_visual_correlation=corr,
            )
        )
    return out, meta


async def export_monitor_changes_csv(
    monitor_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
    *,
    period: str | None,
    category: str | None,
    sort: str,
    limit: int,
) -> tuple[bytes, str]:
    """CSV export for content changes (same filters as list; capped rows)."""
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    cap = min(max(1, limit), settings.MONITOR_CHANGES_EXPORT_MAX_ROWS)
    filters = [MonitorChange.monitor_id == monitor_id]
    if period:
        delta = PERIOD_TO_DELTA.get(period, PERIOD_TO_DELTA["24h"])
        cutoff = datetime.now(timezone.utc) - delta
        filters.append(MonitorChange.detected_at >= cutoff)
    if category and category in ("small", "medium", "large"):
        filters.append(
            MonitorChange.diff_summary.contains({"changeCategory": category})
        )
    order_col = (
        MonitorChange.detected_at.desc()
        if sort == "desc"
        else MonitorChange.detected_at.asc()
    )
    q = (
        select(MonitorChange)
        .where(and_(*filters))
        .order_by(order_col)
        .limit(cap)
    )
    rows = (await db.execute(q)).scalars().all()
    buf = io.StringIO()
    writer = csv.writer(buf)
    api_prefix = settings.API_V1_PREFIX.rstrip("/")
    writer.writerow(
        [
            "id",
            "detectedAt",
            "category",
            "linesAdded",
            "linesRemoved",
            "linesChanged",
            "diffFingerprint",
            "diffUrl",
        ]
    )
    for ch in rows:
        ds = ch.diff_summary if isinstance(ch.diff_summary, dict) else {}
        diff_url = f"{api_prefix}/monitors/{monitor_id}/changes/{ch.id}/diff"
        writer.writerow(
            [
                str(ch.id),
                (ch.detected_at.isoformat() if ch.detected_at else ""),
                str(ds.get("changeCategory", "")),
                int(ds.get("linesAdded", 0) or 0),
                int(ds.get("linesRemoved", 0) or 0),
                int(ds.get("linesChanged", 0) or 0),
                str(ds.get("diffFingerprint", "") or ""),
                diff_url,
            ]
        )
    filename = f"monitor-{monitor_id}-changes.csv"
    return buf.getvalue().encode("utf-8"), filename


async def export_monitor_changes_pdf(
    monitor_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
    *,
    period: str | None,
    category: str | None,
    sort: str,
    limit: int,
) -> tuple[bytes, str]:
    """Minimal audit PDF (feature-flagged at route layer)."""
    if not settings.MONITOR_CHANGES_EXPORT_PDF_ENABLED:
        raise NotFoundError(code="EXPORT_NOT_ENABLED", message="PDF export is disabled")
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    cap = min(max(1, limit), settings.MONITOR_CHANGES_EXPORT_MAX_ROWS)
    filters = [MonitorChange.monitor_id == monitor_id]
    if period:
        delta = PERIOD_TO_DELTA.get(period, PERIOD_TO_DELTA["24h"])
        cutoff = datetime.now(timezone.utc) - delta
        filters.append(MonitorChange.detected_at >= cutoff)
    if category and category in ("small", "medium", "large"):
        filters.append(
            MonitorChange.diff_summary.contains({"changeCategory": category})
        )
    order_col = (
        MonitorChange.detected_at.desc()
        if sort == "desc"
        else MonitorChange.detected_at.asc()
    )
    q = (
        select(MonitorChange)
        .where(and_(*filters))
        .order_by(order_col)
        .limit(cap)
    )
    rows = (await db.execute(q)).scalars().all()
    from fpdf import FPDF

    pdf = FPDF()
    pdf.set_auto_page_break(auto=True, margin=12)
    pdf.add_page()
    pdf.set_font("Helvetica", "B", 14)
    pdf.cell(0, 10, "Monitor content changes (audit)", new_x="LMARGIN", new_y="NEXT")
    pdf.set_font("Helvetica", size=10)
    pdf.multi_cell(0, 6, f"Monitor: {m.display_name}\nURL: {m.url}")
    filt = f"period={period or 'all'} category={category or 'all'} sort={sort} limit={cap}"
    pdf.multi_cell(0, 6, f"Filters: {filt}")
    pdf.ln(4)
    pdf.set_font("Helvetica", "B", 9)
    col_w = (pdf.w - 24) / 4
    for h in ("detectedAt", "category", "lines +/-", "diffFingerprint"):
        pdf.cell(col_w, 7, h[:18], border=1)
    pdf.ln()
    pdf.set_font("Helvetica", size=8)
    for ch in rows:
        ds = ch.diff_summary if isinstance(ch.diff_summary, dict) else {}
        ts = ch.detected_at.isoformat() if ch.detected_at else ""
        cat = str(ds.get("changeCategory", ""))
        lines = f"+{ds.get('linesAdded', 0)}/-{ds.get('linesRemoved', 0)}"
        dfp = str(ds.get("diffFingerprint", "") or "")[:20]
        pdf.cell(col_w, 6, ts[:19], border=1)
        pdf.cell(col_w, 6, cat[:12], border=1)
        pdf.cell(col_w, 6, lines[:14], border=1)
        pdf.cell(col_w, 6, dfp, border=1)
        pdf.ln()
    out = pdf.output()
    raw: bytes = out if isinstance(out, (bytes, bytearray)) else out.encode("latin-1")
    filename = f"monitor-{monitor_id}-changes-audit.pdf"
    return raw, filename


def _visual_capture_to_response(c: MonitorVisualCapture) -> MonitorVisualCaptureResponse:
    return MonitorVisualCaptureResponse(
        id=str(c.id),
        monitor_id=str(c.monitor_id),
        check_id=str(c.check_id) if c.check_id else None,
        captured_at=c.captured_at,
        width_px=c.width_px,
        height_px=c.height_px,
        viewport_width=c.viewport_width,
        viewport_height=c.viewport_height,
        full_page=c.full_page,
        perceptual_hash_hex=c.perceptual_hash_hex,
        dhash_algo=c.dhash_algo,
    )


def _visual_change_to_response(ch: MonitorVisualChange) -> MonitorVisualChangeResponse:
    return MonitorVisualChangeResponse(
        id=str(ch.id),
        monitor_id=str(ch.monitor_id),
        detected_at=ch.detected_at,
        previous_capture_id=str(ch.previous_capture_id),
        current_capture_id=str(ch.current_capture_id),
        diff_summary=ch.diff_summary if isinstance(ch.diff_summary, dict) else {},
    )


async def get_visual_captures(
    monitor_id: uuid.UUID,
    user_id: int,
    page: int,
    limit: int,
    db: AsyncSession,
    period: str | None = None,
    sort: str = "desc",
) -> tuple[list[MonitorVisualCaptureResponse], dict[str, int]]:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    filters = [MonitorVisualCapture.monitor_id == monitor_id]
    if period:
        delta = PERIOD_TO_DELTA.get(period, PERIOD_TO_DELTA["24h"])
        cutoff = datetime.now(timezone.utc) - delta
        filters.append(MonitorVisualCapture.captured_at >= cutoff)
    count_stmt = select(func.count()).select_from(MonitorVisualCapture).where(
        and_(*filters)
    )
    total = int(await db.scalar(count_stmt) or 0)
    offset = (page - 1) * limit
    order_col = (
        MonitorVisualCapture.captured_at.desc()
        if sort == "desc"
        else MonitorVisualCapture.captured_at.asc()
    )
    q = (
        select(MonitorVisualCapture)
        .where(and_(*filters))
        .order_by(order_col)
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    meta = {"page": page, "limit": limit, "total": total}
    return [_visual_capture_to_response(c) for c in rows], meta


async def get_visual_changes(
    monitor_id: uuid.UUID,
    user_id: int,
    page: int,
    limit: int,
    db: AsyncSession,
    period: str | None = None,
    sort: str = "desc",
) -> tuple[list[MonitorVisualChangeResponse], dict[str, int]]:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    filters = [MonitorVisualChange.monitor_id == monitor_id]
    if period:
        delta = PERIOD_TO_DELTA.get(period, PERIOD_TO_DELTA["24h"])
        cutoff = datetime.now(timezone.utc) - delta
        filters.append(MonitorVisualChange.detected_at >= cutoff)
    count_stmt = select(func.count()).select_from(MonitorVisualChange).where(
        and_(*filters)
    )
    total = int(await db.scalar(count_stmt) or 0)
    offset = (page - 1) * limit
    order_col = (
        MonitorVisualChange.detected_at.desc()
        if sort == "desc"
        else MonitorVisualChange.detected_at.asc()
    )
    q = (
        select(MonitorVisualChange)
        .where(and_(*filters))
        .order_by(order_col)
        .offset(offset)
        .limit(limit)
    )
    rows = (await db.execute(q)).scalars().all()
    meta = {"page": page, "limit": limit, "total": total}
    return [_visual_change_to_response(c) for c in rows], meta


async def get_visual_capture_png_for_owner(
    monitor_id: uuid.UUID,
    capture_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
) -> tuple[bytes, MonitorVisualCapture]:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    cap = await db.get(MonitorVisualCapture, capture_id)
    if not cap or cap.monitor_id != monitor_id:
        raise NotFoundError(code="VISUAL_CAPTURE_NOT_FOUND", message="Capture not found")
    return cap.image_png, cap


def _truncate_for_diff_api(text: str, max_chars: int) -> tuple[str, bool]:
    """Return (possibly truncated text, was_truncated)."""
    if len(text) <= max_chars:
        return text, False
    head = text[:max_chars]
    return (
        head + "\n\n[… truncated for diff preview — increase limit or use raw export …]",
        True,
    )


async def get_change_diff(
    monitor_id: uuid.UUID,
    change_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
) -> MonitorDiffResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    ch = await db.get(MonitorChange, change_id)
    if not ch:
        raise ChangeNotFoundException(message=f"Change {change_id} not found")
    if ch.monitor_id != monitor_id:
        raise ChangeNotFoundException(
            message="Change does not belong to this monitor",
        )
    if ch.previous_snapshot_id is None or ch.current_snapshot_id is None:
        raise SnapshotNotFoundException(
            message=(
                "Snapshot content has been purged by retention policy. "
                "Change metadata is still available."
            ),
        )
    prev_s = await db.get(MonitorSnapshot, ch.previous_snapshot_id)
    cur_s = await db.get(MonitorSnapshot, ch.current_snapshot_id)
    if not prev_s or not cur_s:
        raise SnapshotNotFoundException(
            message=(
                "Snapshot content has been purged by retention policy. "
                "Change metadata is still available."
            ),
        )
    prev_full, cur_full = prev_s.content, cur_s.content
    orig_prev_len = len(prev_full)
    orig_cur_len = len(cur_full)
    sel_cfg = get_selector_extraction_config(m.capabilities)
    prev_for_diff = extract_for_content_pipeline(prev_full, sel_cfg)
    cur_for_diff = extract_for_content_pipeline(cur_full, sel_cfg)
    cap = settings.MONITOR_DIFF_MAX_CHARS_PER_SIDE
    prev_txt, prev_trunc = _truncate_for_diff_api(prev_for_diff, cap)
    cur_txt, cur_trunc = _truncate_for_diff_api(cur_for_diff, cap)
    truncated = prev_trunc or cur_trunc
    logger.info(
        "content_accessed",
        monitor_id=str(monitor_id),
        user_id=user_id,
        snapshot_before_id=str(ch.previous_snapshot_id),
        snapshot_after_id=str(ch.current_snapshot_id),
        content_size_bytes=orig_prev_len + orig_cur_len,
        access_type="diff",
    )
    if truncated:
        logger.info(
            "monitor_diff_truncated",
            monitor_id=str(monitor_id),
            change_id=str(change_id),
            original_previous_length=orig_prev_len,
            original_current_length=orig_cur_len,
            cap_per_side=cap,
        )
    table_lines = min(
        settings.MONITOR_DIFF_HTML_TABLE_MAX_LINES,
        settings.DIFF_MAX_LINES,
    )
    diff_html = generate_html_diff(prev_txt, cur_txt, max_lines=table_lines)
    unified = generate_unified_diff(prev_txt, cur_txt, max_lines=table_lines)
    ds = _normalize_diff_summary_for_api(
        ch.diff_summary if isinstance(ch.diff_summary, dict) else {}
    )
    v_cap_id: str | None = None
    v_corr: CorrelationMethod | None = None
    if "visual_change" in set(m.enabled_capabilities or []):
        vmap = await resolve_linked_visual_captures_for_changes(m, [ch], db)
        tid, tmethod = vmap.get(ch.id, (None, None))
        if tid is not None:
            v_cap_id = str(tid)
        v_corr = tmethod
    return MonitorDiffResponse(
        change_id=str(ch.id),
        previous_content=prev_txt,
        current_content=cur_txt,
        diff_html=diff_html,
        unified_diff=unified,
        truncated=truncated,
        previous_content_length=orig_prev_len,
        current_content_length=orig_cur_len,
        max_display_length=cap,
        previous_captured_at=prev_s.captured_at,
        current_captured_at=cur_s.captured_at,
        diff_summary=ds,
        original_previous_length=orig_prev_len,
        original_current_length=orig_cur_len,
        linked_visual_capture_id=v_cap_id,
        linked_visual_correlation=v_corr,
    )


async def get_baseline_snapshot(
    monitor_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
) -> MonitorBaselineResponse | None:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    stmt = (
        select(MonitorSnapshot)
        .where(
            MonitorSnapshot.monitor_id == monitor_id,
            MonitorSnapshot.is_baseline.is_(True),
        )
        .order_by(MonitorSnapshot.captured_at.desc())
        .limit(1)
    )
    snap = (await db.execute(stmt)).scalar_one_or_none()
    if snap is None:
        legacy = (
            select(MonitorSnapshot)
            .where(MonitorSnapshot.monitor_id == monitor_id)
            .order_by(MonitorSnapshot.captured_at.asc())
            .limit(1)
        )
        snap = (await db.execute(legacy)).scalar_one_or_none()
    if snap is None:
        return None
    return MonitorBaselineResponse(
        snapshot_id=str(snap.id),
        captured_at=snap.captured_at,
        content_hash=snap.content_hash,
        content_size_bytes=snap.content_size_bytes,
        content_type=snap.content_type,
        charset=snap.charset,
        http_status_code=snap.http_status_code,
        is_baseline=bool(snap.is_baseline),
    )


async def get_snapshot_raw_for_owner(
    monitor_id: uuid.UUID,
    snapshot_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
) -> MonitorSnapshot:
    """
    Return snapshot row for raw export.

    SECURITY NOTE: Snapshot content may contain PII, session tokens, or admin HTML.
    Only the monitor owner may access; retention is enforced by cleanup task.
    """
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    snap = await db.get(MonitorSnapshot, snapshot_id)
    if not snap or snap.monitor_id != monitor_id:
        raise SnapshotNotFoundException(message="Snapshot not found")
    logger.info(
        "content_accessed",
        monitor_id=str(monitor_id),
        user_id=user_id,
        snapshot_id=str(snapshot_id),
        content_size_bytes=snap.content_size_bytes,
        access_type="raw_export",
    )
    return snap


async def get_ssl_status(
    monitor_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
    live: bool = False,
) -> MonitorSslStatusResponse:
    m = await db.get(Monitor, monitor_id)
    if not m or m.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    if not _is_ssl_enabled(m):
        raise SslNotEnabledException()

    thresholds = _ssl_thresholds_from_config(m.capabilities.get("ssl_expiry", {}))

    if live:
        return await _live_ssl_probe(m, db)

    latest = await _get_latest_ssl_check(monitor_id, db)
    if not latest or not latest.ssl_snapshot or not isinstance(latest.ssl_snapshot, dict):
        return MonitorSslStatusResponse(
            days_remaining=None,
            expiry_date=None,
            issuer=None,
            subject=None,
            is_valid=False,
            severity_level="unknown",
            is_expiring_soon=False,
            is_expired=False,
            subject_alternative_names=[],
            chain_summary=[],
            last_checked_at=None,
            serial_number=None,
            signature_algorithm=None,
            sha256_fingerprint=None,
            error=None,
            valid_from="",
            valid_to="",
        )

    checked_at = latest.checked_at
    if checked_at.tzinfo is None:
        checked_at = checked_at.replace(tzinfo=timezone.utc)
    return _snapshot_to_ssl_response(latest.ssl_snapshot, checked_at, thresholds)


async def stream_monitor_channel(
    monitor_id: uuid.UUID,
    redis: Redis,
) -> asyncio.AsyncGenerator[bytes, None]:
    """SSE bytes: Redis Pub/Sub for check + status events, plus periodic heartbeat."""
    pubsub = redis.pubsub()
    channel = f"monitor:{monitor_id}:events"
    await pubsub.subscribe(channel)
    loop = asyncio.get_running_loop()
    last_hb = loop.time()
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg.get("type") == "message":
                raw_data = msg.get("data")
                if raw_data is None:
                    pass
                else:
                    if isinstance(raw_data, bytes):
                        raw_data = raw_data.decode()
                    try:
                        outer = json.loads(raw_data)
                    except json.JSONDecodeError:
                        outer = {}
                    ev = outer.get("event", "message")
                    payload = outer.get("data", outer)
                    yield f"event: {ev}\ndata: {json.dumps(payload)}\n\n".encode()
            now = loop.time()
            if now - last_hb >= settings.MONITOR_SSE_HEARTBEAT_SECONDS:
                last_hb = now
                ts = datetime.now(timezone.utc).isoformat()
                yield f"event: heartbeat\ndata: {json.dumps({'ts': ts})}\n\n".encode()
            await asyncio.sleep(0.02)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()


async def stream_user_monitors_live(
    user_id: int,
    redis: Redis,
) -> asyncio.AsyncGenerator[bytes, None]:
    """SSE bytes for all monitors owned by user.

    Emits **unnamed** ``data:`` events only so browser ``EventSource.onmessage`` receives them.
    Payload shape: ``{\"id\": \"<uuid>\", \"event\": \"<name>\", \"data\": {...}}``.
    Heartbeats use ``type: heartbeat``.
    """
    pubsub = redis.pubsub()
    channel = _user_live_channel(user_id)
    await pubsub.subscribe(channel)
    loop = asyncio.get_running_loop()
    last_hb = loop.time()
    try:
        while True:
            msg = await pubsub.get_message(ignore_subscribe_messages=True, timeout=1.0)
            if msg and msg.get("type") == "message":
                raw_data = msg.get("data")
                if raw_data is not None:
                    if isinstance(raw_data, bytes):
                        raw_data = raw_data.decode()
                    try:
                        outer = json.loads(raw_data)
                    except json.JSONDecodeError:
                        outer = {}
                    mid = outer.get("monitorId")
                    ev = outer.get("event", "message")
                    if isinstance(mid, str) and mid:
                        client_payload = {
                            "id": mid,
                            "event": ev,
                            "data": outer.get("data"),
                        }
                        yield f"data: {json.dumps(client_payload)}\n\n".encode()
            now = loop.time()
            if now - last_hb >= settings.MONITOR_SSE_HEARTBEAT_SECONDS:
                last_hb = now
                ts = datetime.now(timezone.utc).isoformat()
                yield f"data: {json.dumps({'type': 'heartbeat', 'ts': ts})}\n\n".encode()
            await asyncio.sleep(0.02)
    finally:
        await pubsub.unsubscribe(channel)
        await pubsub.close()


def _monitor_row_is_due(
    last_check_at: datetime | None,
    interval_seconds: int | None,
    now: datetime,
) -> bool:
    if last_check_at is None:
        return True
    last = last_check_at
    if last.tzinfo is None:
        last = last.replace(tzinfo=timezone.utc)
    elapsed = (now - last).total_seconds()
    return elapsed >= float(interval_seconds or 60)


async def run_due_monitor_checks_inline() -> dict[str, Any]:
    """
    Run execute_check for each enabled monitor that is past its interval (in-process).

    Used when MONITOR_INLINE_DISPATCH is enabled instead of Celery beat/worker.
    """
    now = datetime.now(timezone.utc)
    dispatched = 0
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        async with async_session_factory() as db:
            result = await db.execute(
                select(Monitor.id, Monitor.last_check_at, Monitor.interval_seconds).where(
                    Monitor.is_enabled.is_(True)
                )
            )
            rows = result.all()
        for mid, last_check_at, interval_seconds in rows:
            if not _monitor_row_is_due(last_check_at, interval_seconds, now):
                continue
            lock_key = f"monitor:check_lock:{mid}"
            got = await redis.set(
                lock_key,
                "1",
                nx=True,
                ex=int(settings.MONITOR_CHECK_LOCK_TTL_SECONDS),
            )
            if not got:
                continue
            try:
                async with async_session_factory() as db:
                    try:
                        chk = await execute_check(mid, db, redis=redis)
                        if chk is not None:
                            await db.commit()
                            dispatched += 1
                        else:
                            await db.rollback()
                    except Exception:
                        await db.rollback()
                        logger.exception(
                            "inline_monitor_check_failed",
                            monitor_id=str(mid),
                        )
            finally:
                await redis.delete(lock_key)
    finally:
        await redis.aclose()
    return {"dispatched": dispatched, "checked_at": now.isoformat()}
