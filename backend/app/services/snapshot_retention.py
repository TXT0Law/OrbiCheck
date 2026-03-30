"""Pure retention planning for monitor snapshots (used by Celery + unit tests)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID


@dataclass(frozen=True)
class _Snap:
    """Minimal snapshot row for retention planning."""

    id: UUID
    captured_at: datetime
    is_baseline: bool


def plan_snapshot_ids_to_delete(
    snapshots: list[_Snap],
    *,
    now: datetime,
    max_age_days: int,
    max_snapshots_per_monitor: int,
    min_retained_snapshots: int,
) -> list[UUID]:
    """
    Return snapshot IDs safe to delete under retention rules.

    Rules:
    - Never delete baseline rows (is_baseline True).
    - Always retain at least min_retained_snapshots non-baseline (newest first).
    - Delete non-protected rows older than max_age_days.
    - If count still exceeds max_snapshots_per_monitor, delete oldest non-protected.
    """
    if not snapshots:
        return []
    if len(snapshots) <= min_retained_snapshots:
        return []

    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    cutoff = now - timedelta(days=max_age_days)
    by_captured = sorted(snapshots, key=lambda s: s.captured_at)

    protected: set[UUID] = {s.id for s in by_captured if s.is_baseline}
    non_baseline = [s for s in by_captured if not s.is_baseline]
    newest_first = sorted(non_baseline, key=lambda s: s.captured_at, reverse=True)
    for s in newest_first[:min_retained_snapshots]:
        protected.add(s.id)

    to_delete: list[UUID] = []
    for s in by_captured:
        if s.id in protected:
            continue
        cap_at = s.captured_at
        if cap_at.tzinfo is None:
            cap_at = cap_at.replace(tzinfo=timezone.utc)
        if cap_at < cutoff:
            to_delete.append(s.id)

    remaining = {s.id for s in by_captured} - set(to_delete)
    while len(remaining) > max_snapshots_per_monitor:
        candidates = [
            s
            for s in by_captured
            if s.id in remaining and s.id not in protected
        ]
        if not candidates:
            break
        oldest = min(candidates, key=lambda s: s.captured_at)
        to_delete.append(oldest.id)
        remaining.remove(oldest.id)

    return to_delete
