"""Maintenance window service (Phase 2.4).

A maintenance window is a user-defined time range during which we suppress
alert dispatch (and optionally probe execution) for one monitor or every
monitor owned by the user. Windows live in ``osint_maintenance_windows`` and
are evaluated lazily from both the dispatch task and the alert evaluation
hook.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Iterable

import structlog
from sqlalchemy import and_, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.monitor import MaintenanceWindow

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


def _window_to_summary(row: MaintenanceWindow) -> WindowSummary:
    return WindowSummary(
        id=row.id,
        title=row.title,
        starts_at=_ensure_aware(row.starts_at),
        ends_at=_ensure_aware(row.ends_at),
        suppress_alerts=bool(row.suppress_alerts),
        suppress_probes=bool(row.suppress_probes),
    )


async def list_active_windows(
    user_id: int,
    monitor_id: uuid.UUID,
    db: AsyncSession,
    *,
    at: datetime | None = None,
) -> list[WindowSummary]:
    """Return windows currently active for ``(user_id, monitor_id)``."""

    now = _ensure_aware(at or datetime.now(timezone.utc))
    stmt = select(MaintenanceWindow).where(
        and_(
            MaintenanceWindow.user_id == user_id,
            MaintenanceWindow.is_enabled.is_(True),
            MaintenanceWindow.starts_at <= now,
            MaintenanceWindow.ends_at > now,
            or_(
                MaintenanceWindow.monitor_id.is_(None),
                MaintenanceWindow.monitor_id == monitor_id,
            ),
        )
    )
    rows = (await db.execute(stmt)).scalars().all()
    return [_window_to_summary(r) for r in rows]


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
    )
    db.add(row)
    await db.flush()
    return row


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
    monitor_id: uuid.UUID | None | object = ...,  # sentinel: unset
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
    if monitor_id is not ...:
        row.monitor_id = monitor_id  # type: ignore[assignment]
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
