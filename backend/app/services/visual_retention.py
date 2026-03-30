"""Retention planning for monitor visual captures (Celery cleanup)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta, timezone
from uuid import UUID


@dataclass(frozen=True)
class _VisCap:
    """Minimal capture row for retention planning."""

    id: UUID
    captured_at: datetime


def plan_visual_capture_ids_to_delete(
    captures: list[_VisCap],
    *,
    now: datetime,
    max_age_days: int,
    max_per_monitor: int,
    min_retained: int,
) -> list[UUID]:
    """
    Return capture IDs safe to delete (newest-first protection, age, count caps).

    Mirrors snapshot retention semantics without a baseline flag.
    """
    if not captures:
        return []
    if len(captures) <= min_retained:
        return []

    if now.tzinfo is None:
        now = now.replace(tzinfo=timezone.utc)

    cutoff = now - timedelta(days=max_age_days)
    by_detected = sorted(captures, key=lambda c: c.captured_at)

    protected: set[UUID] = set()
    newest_first = sorted(by_detected, key=lambda c: c.captured_at, reverse=True)
    for c in newest_first[:min_retained]:
        protected.add(c.id)

    to_delete: list[UUID] = []
    for c in by_detected:
        if c.id in protected:
            continue
        detected = c.captured_at
        if detected.tzinfo is None:
            detected = detected.replace(tzinfo=timezone.utc)
        if detected < cutoff:
            to_delete.append(c.id)

    remaining = {c.id for c in by_detected} - set(to_delete)
    while len(remaining) > max_per_monitor:
        candidates = [
            c
            for c in by_detected
            if c.id in remaining and c.id not in protected
        ]
        if not candidates:
            break
        oldest = min(
            candidates,
            key=lambda c: c.captured_at.replace(tzinfo=timezone.utc)
            if c.captured_at.tzinfo is None
            else c.captured_at,
        )
        to_delete.append(oldest.id)
        remaining.discard(oldest.id)

    return to_delete
