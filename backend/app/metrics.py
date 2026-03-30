"""Prometheus metrics for monitor content pipeline (low-cardinality labels)."""

from __future__ import annotations

from prometheus_client import Counter

# Reasons: duplicate_diff_fingerprint | degraded_page | normalized_equal | below_threshold | ...
CONTENT_CHANGE_SUPPRESSED = Counter(
    "monitor_content_change_suppressed_total",
    "Content change not recorded (noise / threshold)",
    ["reason"],
)
CONTENT_CHANGE_DETECTED = Counter(
    "monitor_content_change_detected_total",
    "MonitorChange rows persisted after thresholds",
)
CONTENT_CHANGE_BELOW_THRESHOLD = Counter(
    "monitor_content_change_below_threshold_total",
    "Suppressed because evaluate_content_threshold returned false",
)
CONTENT_ALERT_SUPPRESSED = Counter(
    "monitor_content_change_alert_suppressed_total",
    "Notification suppressed while MonitorChange row persisted",
    ["reason"],
)


_ALLOWED_SUPPRESS = frozenset(
    {
        "degraded_page",
        "normalized_equal",
        "duplicate_diff_fingerprint",
    }
)


def inc_suppressed(reason: str) -> None:
    """Increment suppressed counter with a low-cardinality reason token."""
    safe = reason if reason in _ALLOWED_SUPPRESS else "other"
    CONTENT_CHANGE_SUPPRESSED.labels(reason=safe).inc()


def inc_detected() -> None:
    CONTENT_CHANGE_DETECTED.inc()


def inc_below_threshold() -> None:
    CONTENT_CHANGE_BELOW_THRESHOLD.inc()


_ALLOWED_ALERT = frozenset(
    {
        "small_category",
        "repeat_fingerprint_time",
        "repeat_fingerprint_count",
    }
)


def inc_alert_suppressed(reason: str) -> None:
    safe = reason if reason in _ALLOWED_ALERT else "other"
    CONTENT_ALERT_SUPPRESSED.labels(reason=safe).inc()
