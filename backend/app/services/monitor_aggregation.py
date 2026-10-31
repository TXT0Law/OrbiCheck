"""Pure aggregation helpers for monitor checks and uptime summaries."""

from __future__ import annotations

import math
import statistics
from datetime import timezone

from app.api.v1.schemas.monitor import MonitorCurrentStreak, MonitorFailureDistribution
from app.models.monitor import CheckErrorType, MonitorCheck

QUANTILE_DIVISIONS = 100
P50_CUT_POINT_INDEX = 49
P95_CUT_POINT_INDEX = 94
P99_CUT_POINT_INDEX = 98
P95_FRACTION = 0.95


def _count_incidents_from_successes(successes: list[bool]) -> int:
    incidents = 0
    prev_ok = True
    for success in successes:
        if not success and prev_ok:
            incidents += 1
        prev_ok = success
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
    for row in rows:
        if row.success:
            continue
        label = _error_type_to_api_label(row.error_type) or "UNKNOWN"
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
    for index in range(len(rows) - 2, -1, -1):
        if bool(rows[index].success) != up:
            break
        since_idx = index
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


def _compute_latency_percentiles(
    samples: list[float],
) -> tuple[float | None, float | None, float | None]:
    """Return inclusive (p50, p95, p99), including sparse samples."""
    if not samples:
        return (None, None, None)
    if len(samples) == 1:
        single = float(samples[0])
        return (single, single, single)
    sorted_samples = sorted(float(sample) for sample in samples)
    cut_points = statistics.quantiles(
        sorted_samples, n=QUANTILE_DIVISIONS, method="inclusive"
    )
    return (
        cut_points[P50_CUT_POINT_INDEX],
        cut_points[P95_CUT_POINT_INDEX],
        cut_points[P99_CUT_POINT_INDEX],
    )


def _percentile(values: list[float], pct: float) -> float:
    """Nearest-rank percentile in [0, 1]. Returns 0.0 for empty inputs."""
    if not values:
        return 0.0
    sorted_values = sorted(values)
    index = min(len(sorted_values) - 1, max(0, math.ceil(pct * len(sorted_values)) - 1))
    return float(sorted_values[index])


def _p95(values: list[float]) -> float:
    return _percentile(values, P95_FRACTION)
