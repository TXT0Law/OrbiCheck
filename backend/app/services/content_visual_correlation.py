"""Link content_change rows to visual captures (same check_id or nearest in time window)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from typing import Any, Literal
from uuid import UUID

import structlog
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.models.monitor import Monitor, MonitorChange, MonitorSnapshot, MonitorVisualCapture

logger = structlog.get_logger(__name__)

CorrelationMethod = Literal["check_id", "time_window"]


def get_content_visual_correlation_window_seconds(capabilities: dict[str, Any] | None) -> int:
    """Optional override: visual_change.thresholds.contentCorrelationWindowSeconds."""
    caps = capabilities or {}
    raw_vc = caps.get("visual_change")
    if not isinstance(raw_vc, dict):
        return int(settings.CONTENT_VISUAL_CORRELATION_WINDOW_SECONDS)
    th = raw_vc.get("thresholds")
    if not isinstance(th, dict):
        return int(settings.CONTENT_VISUAL_CORRELATION_WINDOW_SECONDS)
    raw = th.get("contentCorrelationWindowSeconds")
    if raw is None:
        return int(settings.CONTENT_VISUAL_CORRELATION_WINDOW_SECONDS)
    try:
        w = int(raw)
    except (TypeError, ValueError):
        return int(settings.CONTENT_VISUAL_CORRELATION_WINDOW_SECONDS)
    return max(0, min(86400, w))


def _normalize_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def pick_nearest_capture_in_window(
    *,
    detected_at: datetime,
    window_seconds: int,
    candidates: list[MonitorVisualCapture],
) -> MonitorVisualCapture | None:
    """Choose capture with minimum |captured_at - detected_at| within window_seconds."""
    if window_seconds <= 0 or not candidates:
        return None
    target = _normalize_utc(detected_at)
    best: MonitorVisualCapture | None = None
    best_delta: float | None = None
    win = float(window_seconds)
    for cap in candidates:
        ct = _normalize_utc(cap.captured_at)
        delta = abs((ct - target).total_seconds())
        if delta > win:
            continue
        if best_delta is None or delta < best_delta:
            best = cap
            best_delta = delta
    return best


async def resolve_linked_visual_captures_for_changes(
    monitor: Monitor,
    changes: list[MonitorChange],
    db: AsyncSession,
) -> dict[UUID, tuple[UUID | None, CorrelationMethod | None]]:
    """
    Map change id -> (visual_capture_id or None, correlation method).

    When visual_change is not enabled for the monitor, returns empty dict (caller treats as no links).
    """
    enabled = set(monitor.enabled_capabilities or [])
    if "visual_change" not in enabled or not changes:
        return {}

    window_s = get_content_visual_correlation_window_seconds(monitor.capabilities)
    out: dict[UUID, tuple[UUID | None, CorrelationMethod | None]] = {}
    pending_window: list[MonitorChange] = []

    cur_ids = [c.current_snapshot_id for c in changes if c.current_snapshot_id]
    snap_by_id: dict[UUID, MonitorSnapshot] = {}
    caps_by_check: dict[UUID, MonitorVisualCapture] = {}

    if cur_ids:
        snaps = (
            (
                await db.execute(
                    select(MonitorSnapshot).where(MonitorSnapshot.id.in_(cur_ids))
                )
            )
            .scalars()
            .all()
        )
        snap_by_id = {s.id: s for s in snaps}

        check_ids = list({s.check_id for s in snaps if s.check_id})
        if check_ids:
            caps_rows = (
                (
                    await db.execute(
                        select(MonitorVisualCapture).where(
                            MonitorVisualCapture.monitor_id == monitor.id,
                            MonitorVisualCapture.check_id.in_(check_ids),
                        )
                    )
                )
                .scalars()
                .all()
            )
            for cap in caps_rows:
                if cap.check_id and cap.check_id not in caps_by_check:
                    caps_by_check[cap.check_id] = cap

    for ch in changes:
        if not ch.current_snapshot_id:
            out[ch.id] = (None, None)
            continue
        snap = snap_by_id.get(ch.current_snapshot_id)
        if snap is None or snap.check_id is None:
            pending_window.append(ch)
            continue
        cap = caps_by_check.get(snap.check_id)
        if cap is not None:
            out[ch.id] = (cap.id, "check_id")
        else:
            pending_window.append(ch)

    if pending_window:
        if window_s > 0:
            min_dt = min(ch.detected_at for ch in pending_window)
            max_dt = max(ch.detected_at for ch in pending_window)
            min_dt = _normalize_utc(min_dt)
            max_dt = _normalize_utc(max_dt)
            span_start = min_dt - timedelta(seconds=window_s)
            span_end = max_dt + timedelta(seconds=window_s)

            pool = (
                (
                    await db.execute(
                        select(MonitorVisualCapture).where(
                            MonitorVisualCapture.monitor_id == monitor.id,
                            MonitorVisualCapture.captured_at >= span_start,
                            MonitorVisualCapture.captured_at <= span_end,
                        )
                    )
                )
                .scalars()
                .all()
            )

            for ch in pending_window:
                picked = pick_nearest_capture_in_window(
                    detected_at=ch.detected_at,
                    window_seconds=window_s,
                    candidates=pool,
                )
                if picked is not None:
                    out[ch.id] = (picked.id, "time_window")
                    logger.debug(
                        "content_visual_correlated_by_time",
                        monitor_id=str(monitor.id),
                        change_id=str(ch.id),
                        capture_id=str(picked.id),
                        window_seconds=window_s,
                    )
                else:
                    out[ch.id] = (None, None)
        else:
            for ch in pending_window:
                out[ch.id] = (None, None)

    for ch in changes:
        out.setdefault(ch.id, (None, None))
    return out
