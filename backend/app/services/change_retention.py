"""Pure retention planning for monitor change history (Celery + unit tests)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from typing import Any
from uuid import UUID


@dataclass(frozen=True)
class _Chg:
    """Minimal change row for retention planning."""

    id: UUID
    detected_at: datetime


@dataclass(frozen=True)
class _ChgDedup:
    """Change row with optional diffFingerprint for consecutive duplicate cleanup."""

    id: UUID
    detected_at: datetime
    diff_fingerprint: str | None


def extract_diff_fingerprint_from_summary(diff_summary: Any) -> str | None:
    """Read diffFingerprint from JSONB diff_summary (may be missing on legacy rows)."""
    if not isinstance(diff_summary, dict):
        return None
    v = diff_summary.get("diffFingerprint")
    if isinstance(v, str) and v:
        return v
    return None


def plan_consecutive_duplicate_fingerprint_deletions(
    changes: list[_ChgDedup],
    *,
    window_seconds: float,
    protected: frozenset[UUID],
) -> list[UUID]:
    """
    Return older change IDs to delete when two consecutive rows share the same
    diffFingerprint and are within window_seconds of each other (newer row kept).

    Does not replace age/count rules; callers union IDs with other retention plans.
    """
    if len(changes) < 2:
        return []
    by_time = sorted(changes, key=lambda c: c.detected_at)
    to_delete: list[UUID] = []
    deleted: set[UUID] = set()
    for i in range(1, len(by_time)):
        prev, cur = by_time[i - 1], by_time[i]
        if prev.id in protected or cur.id in protected:
            continue
        if prev.id in deleted:
            continue
        fp1 = prev.diff_fingerprint
        fp2 = cur.diff_fingerprint
        if not fp1 or fp1 != fp2:
            continue
        pa, pb = prev.detected_at, cur.detected_at
        if pa.tzinfo is None:
            pa = pa.replace(tzinfo=timezone.utc)
        if pb.tzinfo is None:
            pb = pb.replace(tzinfo=timezone.utc)
        if (pb - pa).total_seconds() > window_seconds:
            continue
        to_delete.append(prev.id)
        deleted.add(prev.id)
    return to_delete


def plan_change_ids_to_delete(
    changes: list[_Chg],
    *,
    now: datetime,
    max_age_days: int,
    max_changes_per_monitor: int,
    min_retained_changes: int,
) -> list[UUID]:
    """
    Return MonitorChange IDs safe to delete under retention rules.

    Rules:
    - Always retain at least min_retained_changes (newest first).
    - Delete non-protected rows older than max_age_days.
    - If count still exceeds max_changes_per_monitor, delete oldest non-protected.
    """
    if not changes:
        return []
    if len(changes) <= min_retained_changes:
        return []

    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    cutoff = now - timedelta(days=max_age_days)
    by_detected = sorted(changes, key=lambda c: c.detected_at)

    protected: set[UUID] = set()
    newest_first = sorted(by_detected, key=lambda c: c.detected_at, reverse=True)
    for c in newest_first[:min_retained_changes]:
        protected.add(c.id)

    to_delete: list[UUID] = []
    for c in by_detected:
        if c.id in protected:
            continue
        detected = c.detected_at
        if detected.tzinfo is None:
            detected = detected.replace(tzinfo=timezone.utc)
        if detected < cutoff:
            to_delete.append(c.id)

    remaining = {c.id for c in by_detected} - set(to_delete)
    while len(remaining) > max_changes_per_monitor:
        candidates = [
            c
            for c in by_detected
            if c.id in remaining and c.id not in protected
        ]
        if not candidates:
            break
        oldest = min(candidates, key=lambda c: c.detected_at)
        to_delete.append(oldest.id)
        remaining.remove(oldest.id)

    return to_delete
