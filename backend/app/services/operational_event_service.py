"""Operational diagnostics event helpers."""

from __future__ import annotations

import uuid
from collections.abc import Mapping, Sequence
from typing import Any
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from sqlalchemy import Select, or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import Session

from app.core.exceptions import NotFoundError
from app.models.monitor import Monitor
from app.models.operational_event import OperationalEvent
from app.models.report import Report
from app.models.scan import Scan
from app.models.url_group import UrlGroupRun

MAX_EVENT_MESSAGE_CHARS = 500
MAX_DETAIL_STRING_CHARS = 500
MAX_DETAIL_LIST_ITEMS = 20
MAX_DETAIL_OBJECT_KEYS = 40
DEFAULT_EVENT_LIMIT = 25
MAX_EVENT_LIMIT = 100
REDACTED_VALUE = "[redacted]"
SENSITIVE_KEY_FRAGMENTS = frozenset(
    {
        "authorization",
        "cookie",
        "credential",
        "csrf",
        "password",
        "secret",
        "set-cookie",
        "token",
        "x-api-key",
        "api-key",
        "apikey",
        "api_key",
    }
)
SENSITIVE_URL_QUERY_KEY_FRAGMENTS = frozenset(
    {
        "auth",
        "csrf",
        "key",
        "password",
        "secret",
        "session",
        "token",
    }
)


def _truncate_text(value: str, limit: int = MAX_EVENT_MESSAGE_CHARS) -> str:
    text = value.strip()
    if len(text) <= limit:
        return text
    return f"{text[: limit - 3]}..."


def _is_sensitive_key(key: object) -> bool:
    normalized = str(key).strip().lower().replace("_", "-")
    return any(fragment in normalized for fragment in SENSITIVE_KEY_FRAGMENTS)


def _is_sensitive_url_query_key(key: object) -> bool:
    normalized = str(key).strip().lower().replace("_", "-")
    return any(fragment in normalized for fragment in SENSITIVE_URL_QUERY_KEY_FRAGMENTS)


def sanitize_event_target_url(value: str | None) -> str | None:
    """Remove URL credentials and redact sensitive query parameter values."""

    if value is None:
        return None
    text = value.strip()
    if not text:
        return None
    try:
        parsed = urlsplit(text)
    except ValueError:
        return _truncate_text(text, 2048)

    if not parsed.scheme or not parsed.netloc:
        return _truncate_text(text, 2048)

    host = parsed.hostname
    if not host:
        return _truncate_text(text, 2048)
    if ":" in host and not host.startswith("["):
        host = f"[{host}]"
    netloc = f"{host}:{parsed.port}" if parsed.port is not None else host
    query_pairs = [
        (key, REDACTED_VALUE if _is_sensitive_url_query_key(key) else val)
        for key, val in parse_qsl(parsed.query, keep_blank_values=True)
    ]
    sanitized = urlunsplit(
        (
            parsed.scheme,
            netloc,
            parsed.path,
            urlencode(query_pairs, doseq=True, safe="[]"),
            "",
        )
    )
    return _truncate_text(sanitized, 2048)


def sanitize_event_details(value: Any, *, depth: int = 0) -> Any:
    """Return a bounded JSON-safe payload with obvious secrets redacted."""

    if depth > 3:
        return _truncate_text(str(value), MAX_DETAIL_STRING_CHARS)
    if value is None or isinstance(value, bool | int | float):
        return value
    if isinstance(value, uuid.UUID):
        return str(value)
    if isinstance(value, str):
        return _truncate_text(value, MAX_DETAIL_STRING_CHARS)
    if isinstance(value, Mapping):
        sanitized: dict[str, Any] = {}
        for index, (key, item) in enumerate(value.items()):
            if index >= MAX_DETAIL_OBJECT_KEYS:
                sanitized["truncated"] = True
                break
            key_text = _truncate_text(str(key), MAX_DETAIL_STRING_CHARS)
            sanitized[key_text] = (
                REDACTED_VALUE
                if _is_sensitive_key(key_text)
                else sanitize_event_details(item, depth=depth + 1)
            )
        return sanitized
    if isinstance(value, Sequence) and not isinstance(value, bytes | bytearray):
        return [
            sanitize_event_details(item, depth=depth + 1)
            for item in list(value)[:MAX_DETAIL_LIST_ITEMS]
        ]
    return _truncate_text(str(value), MAX_DETAIL_STRING_CHARS)


def _normalize_limit(limit: int) -> int:
    return min(MAX_EVENT_LIMIT, max(1, int(limit or DEFAULT_EVENT_LIMIT)))


def _coerce_uuid(value: uuid.UUID | str | None) -> uuid.UUID | None:
    if value is None or isinstance(value, uuid.UUID):
        return value
    try:
        return uuid.UUID(str(value))
    except ValueError:
        return None


def _build_event(
    *,
    event_type: str,
    status: str,
    user_id: int | None = None,
    target_url: str | None = None,
    scan_id: uuid.UUID | str | None = None,
    monitor_id: uuid.UUID | str | None = None,
    report_id: uuid.UUID | str | None = None,
    group_id: uuid.UUID | str | None = None,
    group_run_id: uuid.UUID | str | None = None,
    group_run_member_id: uuid.UUID | str | None = None,
    duration_ms: int | None = None,
    retry_count: int = 0,
    error_code: str | None = None,
    message: str | None = None,
    trace_id: str | None = None,
    details: Any = None,
) -> OperationalEvent:
    return OperationalEvent(
        user_id=user_id,
        event_type=_truncate_text(event_type, 96),
        status=_truncate_text(status, 32),
        target_url=sanitize_event_target_url(target_url),
        scan_id=_coerce_uuid(scan_id),
        monitor_id=_coerce_uuid(monitor_id),
        report_id=_coerce_uuid(report_id),
        group_id=_coerce_uuid(group_id),
        group_run_id=_coerce_uuid(group_run_id),
        group_run_member_id=_coerce_uuid(group_run_member_id),
        duration_ms=duration_ms,
        retry_count=max(0, int(retry_count or 0)),
        error_code=_truncate_text(error_code, 96) if error_code else None,
        message=_truncate_text(message) if message else None,
        trace_id=_truncate_text(trace_id, 128) if trace_id else None,
        details=sanitize_event_details(details) if details is not None else None,
    )


async def record_event(
    db: AsyncSession,
    *,
    event_type: str,
    status: str,
    user_id: int | None = None,
    target_url: str | None = None,
    scan_id: uuid.UUID | str | None = None,
    monitor_id: uuid.UUID | str | None = None,
    report_id: uuid.UUID | str | None = None,
    group_id: uuid.UUID | str | None = None,
    group_run_id: uuid.UUID | str | None = None,
    group_run_member_id: uuid.UUID | str | None = None,
    duration_ms: int | None = None,
    retry_count: int = 0,
    error_code: str | None = None,
    message: str | None = None,
    trace_id: str | None = None,
    details: Any = None,
) -> OperationalEvent:
    event = _build_event(
        event_type=event_type,
        status=status,
        user_id=user_id,
        target_url=target_url,
        scan_id=scan_id,
        monitor_id=monitor_id,
        report_id=report_id,
        group_id=group_id,
        group_run_id=group_run_id,
        group_run_member_id=group_run_member_id,
        duration_ms=duration_ms,
        retry_count=retry_count,
        error_code=error_code,
        message=message,
        trace_id=trace_id,
        details=details,
    )
    db.add(event)
    await db.flush()
    return event


def record_event_sync(
    db: Session,
    *,
    event_type: str,
    status: str,
    user_id: int | None = None,
    target_url: str | None = None,
    scan_id: uuid.UUID | str | None = None,
    monitor_id: uuid.UUID | str | None = None,
    report_id: uuid.UUID | str | None = None,
    group_id: uuid.UUID | str | None = None,
    group_run_id: uuid.UUID | str | None = None,
    group_run_member_id: uuid.UUID | str | None = None,
    duration_ms: int | None = None,
    retry_count: int = 0,
    error_code: str | None = None,
    message: str | None = None,
    trace_id: str | None = None,
    details: Any = None,
) -> OperationalEvent:
    event = _build_event(
        event_type=event_type,
        status=status,
        user_id=user_id,
        target_url=target_url,
        scan_id=scan_id,
        monitor_id=monitor_id,
        report_id=report_id,
        group_id=group_id,
        group_run_id=group_run_id,
        group_run_member_id=group_run_member_id,
        duration_ms=duration_ms,
        retry_count=retry_count,
        error_code=error_code,
        message=message,
        trace_id=trace_id,
        details=details,
    )
    db.add(event)
    return event


async def _list_events(
    db: AsyncSession,
    stmt: Select[tuple[OperationalEvent]],
    *,
    limit: int,
) -> list[OperationalEvent]:
    result = await db.execute(
        stmt.order_by(OperationalEvent.created_at.desc(), OperationalEvent.id.desc()).limit(
            _normalize_limit(limit)
        )
    )
    return list(result.scalars().all())


async def list_events_for_report(
    db: AsyncSession,
    *,
    report_id: uuid.UUID,
    user_id: int,
    limit: int = DEFAULT_EVENT_LIMIT,
) -> list[OperationalEvent]:
    report = await db.get(Report, report_id)
    if report is None or report.user_id != user_id:
        raise NotFoundError(code="REPORT_NOT_FOUND", message="Report not found")
    resource_filters = [OperationalEvent.report_id == report_id]
    if report.scan_id is not None:
        resource_filters.append(OperationalEvent.scan_id == report.scan_id)
    stmt = select(OperationalEvent).where(
        OperationalEvent.user_id == user_id,
        or_(*resource_filters),
    )
    return await _list_events(db, stmt, limit=limit)


async def list_events_for_monitor(
    db: AsyncSession,
    *,
    monitor_id: uuid.UUID,
    user_id: int,
    limit: int = DEFAULT_EVENT_LIMIT,
) -> list[OperationalEvent]:
    monitor = await db.get(Monitor, monitor_id)
    if monitor is None or monitor.user_id != user_id:
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")
    stmt = select(OperationalEvent).where(
        OperationalEvent.user_id == user_id,
        OperationalEvent.monitor_id == monitor_id,
    )
    return await _list_events(db, stmt, limit=limit)


async def list_events_for_group_run(
    db: AsyncSession,
    *,
    group_id: uuid.UUID,
    group_run_id: uuid.UUID,
    user_id: int,
    limit: int = DEFAULT_EVENT_LIMIT,
) -> list[OperationalEvent]:
    run = await db.get(UrlGroupRun, group_run_id)
    if run is None or run.group_id != group_id or run.user_id != user_id:
        raise NotFoundError(code="GROUP_RUN_NOT_FOUND", message="Group run not found")
    stmt = select(OperationalEvent).where(
        OperationalEvent.user_id == user_id,
        OperationalEvent.group_run_id == group_run_id,
    )
    return await _list_events(db, stmt, limit=limit)


async def list_events_for_scan(
    db: AsyncSession,
    *,
    scan_id: uuid.UUID,
    user_id: int,
    limit: int = DEFAULT_EVENT_LIMIT,
) -> list[OperationalEvent]:
    scan = await db.get(Scan, scan_id)
    if scan is None or scan.user_id != user_id:
        raise NotFoundError(code="SCAN_NOT_FOUND", message="Scan not found")
    stmt = select(OperationalEvent).where(
        OperationalEvent.user_id == user_id,
        OperationalEvent.scan_id == scan_id,
    )
    return await _list_events(db, stmt, limit=limit)
