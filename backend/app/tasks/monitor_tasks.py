"""Celery tasks for monitor checks and periodic dispatch."""

from __future__ import annotations

import asyncio
import uuid

import redis as redis_sync
import structlog
from sqlalchemy import create_engine, delete, select
from sqlalchemy.engine import Engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import NullPool

from app.core.celery_app import celery_app
from app.core.config import settings
from app.db.session import async_session_factory
from app.models.monitor import (
    MaintenanceWindow,
    Monitor,
    MonitorChange,
    MonitorSnapshot,
    MonitorVisualCapture,
    MonitorVisualChange,
)
from app.services.change_retention import (
    _Chg,
    _ChgDedup,
    extract_diff_fingerprint_from_summary,
    plan_change_ids_to_delete,
    plan_consecutive_duplicate_fingerprint_deletions,
)
from app.services.content_change_helpers import get_effective_dedup_window_seconds
from app.services.maintenance_window_service import (
    matches_tag_scope,
    occurrence_at,
)
from app.services.monitor_service import execute_check
from app.services.snapshot_retention import _Snap, plan_snapshot_ids_to_delete
from app.services.visual_retention import _VisCap, plan_visual_capture_ids_to_delete

logger = structlog.get_logger(__name__)

_dispatch_engine: Engine | None = None


def _get_dispatch_engine() -> Engine:
    global _dispatch_engine
    if _dispatch_engine is None:
        database_url = settings.DATABASE_URL.strip()
        if not database_url:
            raise RuntimeError("DATABASE_URL is not configured")
        _dispatch_engine = create_engine(
            database_url.replace("+asyncpg", "+psycopg2"),
            poolclass=NullPool,
            pool_pre_ping=True,
        )
    return _dispatch_engine


def _is_probe_suppressed_sync(
    monitor: Monitor,
    user_windows,
    now,
) -> bool:
    """Synchronous parity wrapper for ``is_probe_suppressed``.

    Mirrors the recurrence + tag-scope evaluation in
    ``maintenance_window_service.list_active_windows`` so the Celery dispatch
    task (which runs in a sync ``Session``) does not have to spin up an async
    runtime per tick. Returns ``True`` as soon as one matching, currently
    occurring, suppress-probes window is found.
    """
    if not user_windows:
        return False
    monitor_tags = list(monitor.tags or [])
    for window in user_windows:
        if window.monitor_id is not None and window.monitor_id != monitor.id:
            continue
        if not matches_tag_scope(window, monitor_tags):
            continue
        if occurrence_at(window, now) is None:
            continue
        return True
    return False


@celery_app.task(name="app.tasks.monitor_tasks.dispatch_monitor_checks")
def dispatch_monitor_checks() -> dict:
    """Enqueue checks for enabled monitors whose interval has elapsed."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    dispatched = 0
    suppressed = 0
    with Session(_get_dispatch_engine()) as db:
        stmt = select(Monitor).where(Monitor.is_enabled.is_(True))
        monitors = db.scalars(stmt).all()
        # Phase 2b: pull every enabled probe-suppressing window then evaluate
        # recurrence + tag_scope in Python so the dispatcher honors the same
        # rules as ``maintenance_window_service.list_active_windows`` /
        # ``alert_service.is_alert_suppressed``. The legacy SQL filter
        # ``starts_at <= now AND ends_at > now`` ignored recurring occurrences
        # past day 1 and treated every user-wide window as "suppress all
        # monitors", which made tag-scoped windows over-suppress.
        candidate_windows = db.scalars(
            select(MaintenanceWindow).where(
                MaintenanceWindow.is_enabled.is_(True),
                MaintenanceWindow.suppress_probes.is_(True),
            )
        ).all()
        # Group by user once so the per-monitor inner loop stays small even
        # when a user has many windows.
        windows_by_user: dict[int, list[MaintenanceWindow]] = {}
        for w in candidate_windows:
            windows_by_user.setdefault(w.user_id, []).append(w)
        for m in monitors:
            if _is_probe_suppressed_sync(
                m, windows_by_user.get(m.user_id, ()), now
            ):
                suppressed += 1
                continue
            if m.last_check_at is None:
                due = True
            else:
                last = m.last_check_at
                if last.tzinfo is None:
                    last = last.replace(tzinfo=timezone.utc)
                elapsed = (now - last).total_seconds()
                due = elapsed >= float(m.interval_seconds or 60)
            if due:
                run_monitor_check.delay(str(m.id))
                dispatched += 1
    return {
        "dispatched": dispatched,
        "suppressed": suppressed,
        "checked_at": now.isoformat(),
    }


@celery_app.task(
    bind=True,
    max_retries=2,
    default_retry_delay=5,
    acks_late=True,
    name="app.tasks.monitor_tasks.run_monitor_check",
)
def run_monitor_check(self, monitor_id: str) -> dict:
    """Run a single monitor check (async DB + optional Redis publish)."""

    async def _run() -> dict:
        from redis.asyncio import Redis

        mid = uuid.UUID(monitor_id)
        redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
        try:
            async with async_session_factory() as db:
                try:
                    check = await execute_check(mid, db, redis=redis)
                    await db.commit()
                    if not check:
                        return {"monitor_id": monitor_id, "skipped": True}
                    return {
                        "monitor_id": monitor_id,
                        "success": check.success,
                        "status_code": check.status_code,
                        "response_time_ms": check.response_time_ms,
                        "content_changed": check.content_changed,
                    }
                except Exception:
                    await db.rollback()
                    raise
        finally:
            await redis.aclose()

    lock_key = f"monitor:check_lock:{monitor_id}"
    r = redis_sync.Redis.from_url(settings.REDIS_URL, decode_responses=True)
    acquired = False
    try:
        if not r.set(
            lock_key,
            "1",
            nx=True,
            ex=int(settings.MONITOR_CHECK_LOCK_TTL_SECONDS),
        ):
            logger.info("monitor_check_skipped_locked", monitor_id=monitor_id)
            return {"monitor_id": monitor_id, "skipped": "locked"}
        acquired = True
        return asyncio.run(_run())
    except Exception as exc:
        logger.exception("monitor_check_failed", monitor_id=monitor_id)
        raise self.retry(exc=exc) from exc
    finally:
        if acquired:
            try:
                r.delete(lock_key)
            except Exception:
                pass
        try:
            r.close()
        except Exception:
            pass


@celery_app.task(name="app.tasks.monitor_tasks.cleanup_monitor_snapshots")
def cleanup_monitor_snapshots() -> dict:
    """Drop old snapshots and change-history rows per retention rules."""
    from datetime import datetime, timezone

    now = datetime.now(timezone.utc)
    total_snapshots = 0
    total_changes = 0
    total_visual_captures = 0
    total_visual_changes = 0
    monitors_with_content = 0
    monitors_with_visual = 0
    with Session(_get_dispatch_engine()) as db:
        rows = db.execute(select(Monitor.id, Monitor.enabled_capabilities)).all()
        monitor_ids = [
            r[0] for r in rows if r[1] and "content_change" in list(r[1])
        ]
        visual_monitor_ids = [
            r[0] for r in rows if r[1] and "visual_change" in list(r[1])
        ]
        monitors_with_content = len(monitor_ids)
        monitors_with_visual = len(visual_monitor_ids)
        for mid in monitor_ids:
            snaps = db.scalars(
                select(MonitorSnapshot)
                .where(MonitorSnapshot.monitor_id == mid)
                .order_by(MonitorSnapshot.captured_at.asc())
            ).all()
            if snaps:
                plan_sn = [_Snap(s.id, s.captured_at, bool(s.is_baseline)) for s in snaps]
                snap_ids = plan_snapshot_ids_to_delete(
                    plan_sn,
                    now=now,
                    max_age_days=settings.MONITOR_MAX_SNAPSHOT_AGE_DAYS,
                    max_snapshots_per_monitor=settings.MONITOR_MAX_SNAPSHOTS_PER_MONITOR,
                    min_retained_snapshots=settings.MONITOR_MIN_RETAINED_SNAPSHOTS,
                )
                if snap_ids:
                    db.execute(
                        delete(MonitorSnapshot).where(MonitorSnapshot.id.in_(snap_ids))
                    )
                    total_snapshots += len(snap_ids)

            ch_rows = db.scalars(
                select(MonitorChange)
                .where(MonitorChange.monitor_id == mid)
                .order_by(MonitorChange.detected_at.asc())
            ).all()
            if ch_rows:
                plan_ch = [_Chg(c.id, c.detected_at) for c in ch_rows]
                ch_ids = plan_change_ids_to_delete(
                    plan_ch,
                    now=now,
                    max_age_days=settings.MONITOR_MAX_CHANGE_AGE_DAYS,
                    max_changes_per_monitor=settings.MONITOR_MAX_CHANGES_PER_MONITOR,
                    min_retained_changes=settings.MONITOR_MIN_RETAINED_CHANGES,
                )
                caps_raw = db.execute(
                    select(Monitor.capabilities).where(Monitor.id == mid)
                ).scalar_one_or_none()
                caps = caps_raw if isinstance(caps_raw, dict) else None
                if settings.MONITOR_CHANGE_DEDUP_RETENTION_ENABLED:
                    newest_first = sorted(
                        ch_rows, key=lambda c: c.detected_at, reverse=True
                    )
                    protected = frozenset(
                        c.id
                        for c in newest_first[: settings.MONITOR_MIN_RETAINED_CHANGES]
                    )
                    dedup_plan = [
                        _ChgDedup(
                            c.id,
                            c.detected_at,
                            extract_diff_fingerprint_from_summary(c.diff_summary),
                        )
                        for c in ch_rows
                    ]
                    dedup_win = float(
                        get_effective_dedup_window_seconds(caps)
                    )
                    dup_ids = plan_consecutive_duplicate_fingerprint_deletions(
                        dedup_plan,
                        window_seconds=dedup_win,
                        protected=protected,
                    )
                    ch_ids = list(set(ch_ids) | set(dup_ids))
                if ch_ids:
                    db.execute(
                        delete(MonitorChange).where(MonitorChange.id.in_(ch_ids))
                    )
                    total_changes += len(ch_ids)
        for mid in visual_monitor_ids:
            v_caps = db.scalars(
                select(MonitorVisualCapture)
                .where(MonitorVisualCapture.monitor_id == mid)
                .order_by(MonitorVisualCapture.captured_at.asc())
            ).all()
            if v_caps:
                plan_vc = [_VisCap(c.id, c.captured_at) for c in v_caps]
                vc_ids = plan_visual_capture_ids_to_delete(
                    plan_vc,
                    now=now,
                    max_age_days=settings.MONITOR_MAX_VISUAL_CAPTURE_AGE_DAYS,
                    max_per_monitor=settings.MONITOR_MAX_VISUAL_CAPTURES_PER_MONITOR,
                    min_retained=settings.MONITOR_MIN_RETAINED_VISUAL_CAPTURES,
                )
                if vc_ids:
                    db.execute(
                        delete(MonitorVisualCapture).where(
                            MonitorVisualCapture.id.in_(vc_ids)
                        )
                    )
                    total_visual_captures += len(vc_ids)
            v_ch = db.scalars(
                select(MonitorVisualChange)
                .where(MonitorVisualChange.monitor_id == mid)
                .order_by(MonitorVisualChange.detected_at.asc())
            ).all()
            if v_ch:
                plan_vch = [_Chg(c.id, c.detected_at) for c in v_ch]
                vch_ids = plan_change_ids_to_delete(
                    plan_vch,
                    now=now,
                    max_age_days=settings.MONITOR_MAX_VISUAL_CHANGE_AGE_DAYS,
                    max_changes_per_monitor=settings.MONITOR_MAX_VISUAL_CHANGES_PER_MONITOR,
                    min_retained_changes=settings.MONITOR_MIN_RETAINED_VISUAL_CHANGES,
                )
                if vch_ids:
                    db.execute(
                        delete(MonitorVisualChange).where(
                            MonitorVisualChange.id.in_(vch_ids)
                        )
                    )
                    total_visual_changes += len(vch_ids)
        db.commit()
    return {
        "monitors_processed": monitors_with_content,
        "monitors_with_visual": monitors_with_visual,
        "snapshots_deleted": total_snapshots,
        "changes_deleted": total_changes,
        "visual_captures_deleted": total_visual_captures,
        "visual_changes_deleted": total_visual_changes,
    }
