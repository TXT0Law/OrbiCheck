"""Retention planning for monitor visual captures (Celery cleanup)."""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from uuid import UUID


@dataclass(frozen=True)
class _VisCap:
    """Minimal capture row for retention planning.

    ``is_diagnostic`` (V-1) splits the retention budget so a long stream of
    Cloudflare-interstitial screenshots cannot push real baselines past the
    ``max_per_monitor`` cap. Diagnostic rows are subject to their own
    (smaller) ``max_diagnostic_per_monitor`` cap and the same age limit.
    Defaults to ``False`` so older callers / DB rows that pre-date the
    flag continue to behave as "real" captures.
    """

    id: UUID
    captured_at: datetime
    is_diagnostic: bool = field(default=False)


def _ensure_utc(dt: datetime) -> datetime:
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt


def _plan_group(
    captures: list[_VisCap],
    *,
    now: datetime,
    max_age_days: int,
    max_per_monitor: int,
    min_retained: int,
) -> list[UUID]:
    """Apply age + count caps to a homogenous list of captures.

    Newest-first protection keeps ``min_retained`` rows even if they are
    older than ``max_age_days``; this preserves at least one diagnostic
    baseline so the timeline never becomes empty after a long quiet
    period.
    """
    if not captures:
        return []
    if len(captures) <= min_retained:
        return []

    cutoff = now - timedelta(days=max_age_days)
    by_detected = sorted(captures, key=lambda c: c.captured_at)
    newest_first = sorted(by_detected, key=lambda c: c.captured_at, reverse=True)

    protected: set[UUID] = {c.id for c in newest_first[:min_retained]}

    to_delete: list[UUID] = []
    for c in by_detected:
        if c.id in protected:
            continue
        if _ensure_utc(c.captured_at) < cutoff:
            to_delete.append(c.id)

    remaining = {c.id for c in by_detected} - set(to_delete)
    while len(remaining) > max_per_monitor:
        candidates = [
            c for c in by_detected if c.id in remaining and c.id not in protected
        ]
        if not candidates:
            break
        oldest = min(candidates, key=lambda c: _ensure_utc(c.captured_at))
        to_delete.append(oldest.id)
        remaining.discard(oldest.id)

    return to_delete


def plan_visual_capture_ids_to_delete(
    captures: list[_VisCap],
    *,
    now: datetime,
    max_age_days: int,
    max_per_monitor: int,
    min_retained: int,
    max_diagnostic_per_monitor: int | None = None,
) -> list[UUID]:
    """
    Return capture IDs safe to delete (newest-first protection, age, count caps).

    V-1: when ``max_diagnostic_per_monitor`` is provided, diagnostic captures
    are budgeted separately from real captures so the failure stream cannot
    overwhelm the baseline timeline. Diagnostic rows share the same
    ``max_age_days`` and ``min_retained`` settings.
    """
    if not captures:
        return []

    now = _ensure_utc(now)

    real = [c for c in captures if not c.is_diagnostic]
    diagnostic = [c for c in captures if c.is_diagnostic]

    to_delete: list[UUID] = []
    to_delete.extend(
        _plan_group(
            real,
            now=now,
            max_age_days=max_age_days,
            max_per_monitor=max_per_monitor,
            min_retained=min_retained,
        )
    )
    if diagnostic:
        # When no explicit cap is given, fall back to the standard
        # ``max_per_monitor`` so old call sites do not regress (diagnostic
        # rows just share the legacy budget).
        diag_cap = (
            max_diagnostic_per_monitor
            if max_diagnostic_per_monitor is not None
            else max_per_monitor
        )
        # Keep one diagnostic baseline so the operator can always see the
        # most recent failure, even when the cap is set very small.
        diag_min = min(min_retained, max(1, diag_cap))
        to_delete.extend(
            _plan_group(
                diagnostic,
                now=now,
                max_age_days=max_age_days,
                max_per_monitor=diag_cap,
                min_retained=diag_min,
            )
        )
    return to_delete
