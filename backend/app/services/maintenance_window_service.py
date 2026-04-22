"""Maintenance window service (Phase 2.4 + 2b).

A maintenance window is a user-defined time range during which we suppress
alert dispatch (and optionally probe execution) for one monitor or every
monitor owned by the user. Windows live in ``osint_maintenance_windows`` and
are evaluated lazily from both the dispatch task and the alert evaluation
hook.

Phase 2b extends the model with two optional dimensions:

* ``recurrence`` — RRULE-lite spec ``{"freq": "daily"|"weekly", "byWeekday":
  [0..6]?, "untilAt": iso?}``. The window then repeats every day (or every
  matching weekday) preserving the original start/end *time-of-day*. We
  evaluate this in pure Python so the same code is reused by tests without
  requiring a Postgres extension.
* ``tag_scope`` — list of monitor tags. When non-empty, the window only
  applies to monitors whose ``tags`` array intersects the list. ``None``/empty
  keeps the legacy "all monitors of this user" semantics.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Iterable

import structlog
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monitor import MaintenanceWindow, Monitor

logger = structlog.get_logger(__name__)


@dataclass(frozen=True)
class WindowSummary:
    """Lightweight projection used by alert/dispatch hooks."""

    id: uuid.UUID
    title: str
    starts_at: datetime
    ends_at: datetime
    suppress_alerts: bool
    suppress_probes: bool


def _ensure_aware(value: datetime) -> datetime:
    return value if value.tzinfo else value.replace(tzinfo=timezone.utc)


def _window_to_summary(
    row: MaintenanceWindow,
    *,
    occurrence_start: datetime | None = None,
    occurrence_end: datetime | None = None,
) -> WindowSummary:
    return WindowSummary(
        id=row.id,
        title=row.title,
        starts_at=_ensure_aware(occurrence_start or row.starts_at),
        ends_at=_ensure_aware(occurrence_end or row.ends_at),
        suppress_alerts=bool(row.suppress_alerts),
        suppress_probes=bool(row.suppress_probes),
    )


def occurrence_at(
    row: MaintenanceWindow, now: datetime
) -> tuple[datetime, datetime] | None:
    """Return the (start, end) of the occurrence containing ``now``.

    For one-shot windows (``recurrence`` is None) this is just the row's own
    range. For recurrences we shift the original interval by whole-day
    increments while preserving the time-of-day, then check whether ``now``
    falls inside the shifted interval. Returns ``None`` when no occurrence is
    active at ``now``.
    """

    starts_at = _ensure_aware(row.starts_at)
    ends_at = _ensure_aware(row.ends_at)

    rec = row.recurrence
    if not rec:
        if starts_at <= now < ends_at:
            return starts_at, ends_at
        return None

    freq = rec.get("freq")
    until_raw = rec.get("untilAt") or rec.get("until_at")
    until_at: datetime | None = None
    if until_raw:
        try:
            until_at = (
                until_raw
                if isinstance(until_raw, datetime)
                else datetime.fromisoformat(str(until_raw))
            )
            until_at = _ensure_aware(until_at)
        except ValueError:
            until_at = None

    duration = ends_at - starts_at
    # Probe a small window around ``now`` so we capture occurrences that
    # started yesterday and end today (e.g. 22:00 → 02:00).
    days_back = max(1, duration.days + 1)
    for offset in range(-days_back, 2):
        cand_start = datetime.combine(
            (now + timedelta(days=offset)).date(),
            starts_at.timetz(),
        )
        cand_end = cand_start + duration
        if cand_start < starts_at:
            continue
        if until_at and cand_start > until_at:
            continue
        if not (cand_start <= now < cand_end):
            continue
        if freq == "weekly":
            allowed = rec.get("byWeekday") or rec.get("by_weekday") or []
            if allowed and cand_start.weekday() not in allowed:
                continue
        elif freq != "daily":
            return None
        return cand_start, cand_end
    return None


def matches_tag_scope(
    row: MaintenanceWindow, monitor_tags: Iterable[str] | None
) -> bool:
    scope = row.tag_scope or []
    if not scope:
        return True
    if not monitor_tags:
        return False
    tags_set = {t for t in monitor_tags if t}
    return any(s in tags_set for s in scope)


# Internal-style aliases retained for tests written before the helpers were
# promoted to the module's public API in Phase 2b dispatcher fix.
_occurrence_at = occurrence_at
_matches_tag_scope = matches_tag_scope


async def _load_monitor_tags(
    monitor_id: uuid.UUID, db: AsyncSession
) -> list[str]:
    row = await db.execute(
        select(Monitor.tags).where(Monitor.id == monitor_id)
    )
    tags = row.scalar_one_or_none()
    return list(tags or [])


async def list_active_windows(
    user_id: int,
    monitor_id: uuid.UUID,
    db: AsyncSession,
    *,
    at: datetime | None = None,
    monitor_tags: Iterable[str] | None = None,
) -> list[WindowSummary]:
    """Return windows currently active for ``(user_id, monitor_id)``.

    Recurrence and tag-scope are evaluated in Python so the SQL filter only
    needs to do the cheap ``user/enabled/monitor_id`` cull.
    """

    now = _ensure_aware(at or datetime.now(timezone.utc))
    stmt = select(MaintenanceWindow).where(
        and_(
            MaintenanceWindow.user_id == user_id,
            MaintenanceWindow.is_enabled.is_(True),
            or_(
                MaintenanceWindow.monitor_id.is_(None),
                MaintenanceWindow.monitor_id == monitor_id,
            ),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()

    tags_for_scope: Iterable[str] | None = monitor_tags
    needs_tags = any(r.tag_scope for r in rows) and tags_for_scope is None
    if needs_tags:
        tags_for_scope = await _load_monitor_tags(monitor_id, db)

    out: list[WindowSummary] = []
    for row in rows:
        if not matches_tag_scope(row, tags_for_scope):
            continue
        occ = occurrence_at(row, now)
        if occ is None:
            continue
        out.append(
            _window_to_summary(
                row, occurrence_start=occ[0], occurrence_end=occ[1]
            )
        )
    return out


async def is_probe_suppressed(
    user_id: int,
    monitor_id: uuid.UUID,
    db: AsyncSession,
    *,
    at: datetime | None = None,
) -> WindowSummary | None:
    for window in await list_active_windows(user_id, monitor_id, db, at=at):
        if window.suppress_probes:
            return window
    return None


async def is_alert_suppressed(
    user_id: int,
    monitor_id: uuid.UUID,
    db: AsyncSession,
    *,
    at: datetime | None = None,
) -> WindowSummary | None:
    for window in await list_active_windows(user_id, monitor_id, db, at=at):
        if window.suppress_alerts:
            return window
    return None


async def list_windows_for_user(
    user_id: int,
    db: AsyncSession,
    *,
    monitor_id: uuid.UUID | None = None,
    include_disabled: bool = True,
) -> list[MaintenanceWindow]:
    filters = [MaintenanceWindow.user_id == user_id]
    if monitor_id is not None:
        filters.append(
            or_(
                MaintenanceWindow.monitor_id.is_(None),
                MaintenanceWindow.monitor_id == monitor_id,
            )
        )
    if not include_disabled:
        filters.append(MaintenanceWindow.is_enabled.is_(True))
    rows = await db.execute(
        select(MaintenanceWindow)
        .where(and_(*filters))
        .order_by(MaintenanceWindow.starts_at.desc())
    )
    return list(rows.scalars().all())


def _serialize_recurrence(spec: object | None) -> dict | None:
    """Coerce a Pydantic ``MaintenanceRecurrenceSpec`` (or dict) to JSONB."""
    if spec is None:
        return None
    if isinstance(spec, dict):
        return spec
    # Avoid importing the API schema module here to keep service-layer
    # isolation: rely on duck typing for ``model_dump``.
    dump = getattr(spec, "model_dump", None)
    if callable(dump):
        return dump(by_alias=True, exclude_none=True)
    raise TypeError(f"Unsupported recurrence spec type: {type(spec)!r}")


async def create_window(
    *,
    user_id: int,
    monitor_id: uuid.UUID | None,
    title: str,
    starts_at: datetime,
    ends_at: datetime,
    suppress_alerts: bool,
    suppress_probes: bool,
    notes: str | None,
    db: AsyncSession,
    recurrence: object | None = None,
    tag_scope: list[str] | None = None,
) -> MaintenanceWindow:
    if ends_at <= starts_at:
        raise ValueError("ends_at must be after starts_at")
    row = MaintenanceWindow(
        user_id=user_id,
        monitor_id=monitor_id,
        title=title.strip(),
        starts_at=_ensure_aware(starts_at),
        ends_at=_ensure_aware(ends_at),
        suppress_alerts=bool(suppress_alerts),
        suppress_probes=bool(suppress_probes),
        notes=(notes.strip() if isinstance(notes, str) else None) or None,
        recurrence=_serialize_recurrence(recurrence),
        tag_scope=list(tag_scope) if tag_scope else None,
    )
    db.add(row)
    await db.flush()
    return row


_UNSET: object = object()


async def update_window(
    *,
    window_id: uuid.UUID,
    user_id: int,
    db: AsyncSession,
    title: str | None = None,
    starts_at: datetime | None = None,
    ends_at: datetime | None = None,
    suppress_alerts: bool | None = None,
    suppress_probes: bool | None = None,
    is_enabled: bool | None = None,
    notes: str | None = None,
    monitor_id: uuid.UUID | None | object = _UNSET,
    recurrence: object | None | object = _UNSET,
    tag_scope: list[str] | None | object = _UNSET,
) -> MaintenanceWindow | None:
    row = await db.get(MaintenanceWindow, window_id)
    if not row or row.user_id != user_id:
        return None
    if title is not None:
        row.title = title.strip()
    if starts_at is not None:
        row.starts_at = _ensure_aware(starts_at)
    if ends_at is not None:
        row.ends_at = _ensure_aware(ends_at)
    if row.ends_at <= row.starts_at:
        raise ValueError("ends_at must be after starts_at")
    if suppress_alerts is not None:
        row.suppress_alerts = bool(suppress_alerts)
    if suppress_probes is not None:
        row.suppress_probes = bool(suppress_probes)
    if is_enabled is not None:
        row.is_enabled = bool(is_enabled)
    if notes is not None:
        row.notes = notes.strip() or None
    if monitor_id is not _UNSET:
        row.monitor_id = monitor_id  # type: ignore[assignment]
    if recurrence is not _UNSET:
        row.recurrence = _serialize_recurrence(recurrence)
    if tag_scope is not _UNSET:
        row.tag_scope = list(tag_scope) if tag_scope else None  # type: ignore[arg-type]
    await db.flush()
    return row


async def delete_window(
    *, window_id: uuid.UUID, user_id: int, db: AsyncSession
) -> bool:
    row = await db.get(MaintenanceWindow, window_id)
    if not row or row.user_id != user_id:
        return False
    await db.delete(row)
    await db.flush()
    return True


def summarize_windows(rows: Iterable[MaintenanceWindow]) -> list[WindowSummary]:
    return [_window_to_summary(r) for r in rows]
