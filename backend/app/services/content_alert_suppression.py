"""Pure notification policy for content_change (after MonitorChange is persisted)."""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timezone
from typing import Any, Literal

from app.core.config import settings


@dataclass(frozen=True)
class ContentAlertSuppressionSettings:
    """Derived from capabilities.content_change.thresholds (camelCase JSON)."""

    alert_only_medium_or_large: bool
    repeat_fingerprint_seconds: int | None
    repeat_max_notifications_per_fingerprint: int | None
    repeat_max_notifications_window_minutes: int | None


def _safe_int(v: Any, default: int) -> int:
    try:
        return int(v)
    except (TypeError, ValueError):
        return default


def get_content_alert_suppression_settings(
    capabilities: dict[str, Any] | None,
) -> ContentAlertSuppressionSettings:
    caps = capabilities or {}
    raw_cc = caps.get("content_change")
    if not isinstance(raw_cc, dict):
        raw_cc = {}
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        th = {}
    only_ml = bool(th.get("alertOnlyMediumOrLarge"))
    ac = th.get("alertOnlyCategories")
    if isinstance(ac, list):
        normalized = {str(x).lower() for x in ac}
        if normalized == {"medium", "large"}:
            only_ml = True

    raw_dedup = th.get("dedupWindowSeconds")
    default_win = _safe_int(
        getattr(settings, "MONITOR_CHANGE_DEDUP_WINDOW_SECONDS", 600),
        600,
    )
    repeat_sec: int | None
    if raw_dedup is None:
        repeat_sec = default_win
    else:
        w = _safe_int(raw_dedup, default_win)
        if w <= 0:
            repeat_sec = None
        else:
            repeat_sec = max(1, min(w, 86400))

    raw_max = th.get("repeatAlertMaxNotificationsPerFingerprint")
    raw_win = th.get("repeatAlertFingerprintWindowMinutes")
    max_n: int | None
    win_m: int | None
    try:
        max_n = int(raw_max) if raw_max is not None else None
    except (TypeError, ValueError):
        max_n = None
    try:
        win_m = int(raw_win) if raw_win is not None else None
    except (TypeError, ValueError):
        win_m = None
    if max_n is not None and max_n <= 0:
        max_n = None
    if win_m is not None and win_m <= 0:
        win_m = None
    if max_n is None or win_m is None:
        max_n = None
        win_m = None

    return ContentAlertSuppressionSettings(
        alert_only_medium_or_large=only_ml,
        repeat_fingerprint_seconds=repeat_sec,
        repeat_max_notifications_per_fingerprint=max_n,
        repeat_max_notifications_window_minutes=win_m,
    )


SuppressReason = Literal[
    "small_category",
    "repeat_fingerprint_time",
    "repeat_fingerprint_count",
]


def decide_content_change_notification(
    *,
    change_category: str,
    diff_fingerprint: str,
    settings_obj: ContentAlertSuppressionSettings,
    now: datetime,
    prev_same_fingerprint_at: datetime | None,
    prior_dispatched_same_fp_in_window: int,
) -> tuple[bool, SuppressReason | None]:
    """
    Decide whether to publish SSE / notification for a persisted change.

    Semantics (documented):
    - alertOnlyMediumOrLarge: never notify for changeCategory == small (row still stored).
    - Time: if the chronologically previous change with the same diffFingerprint exists and
      (now - prev_same_fingerprint_at) <= repeat_fingerprint_seconds, suppress notification.
      (repeat_fingerprint_seconds from dedupWindowSeconds or server default; 0 or missing disables.)
    - Count: if prior_dispatched_same_fp_in_window >= repeat_max_notifications_per_fingerprint,
      suppress (sliding window of repeatAlertFingerprintWindowMinutes; only rows with
      notification_dispatched true count; NULL legacy treated as notified).
    """
    if settings_obj.alert_only_medium_or_large and change_category == "small":
        return False, "small_category"

    rfs = settings_obj.repeat_fingerprint_seconds
    if rfs is not None:
        rfs = _safe_int(rfs, 0)
        if rfs <= 0:
            rfs = None
    if rfs is not None and prev_same_fingerprint_at is not None:
        if prev_same_fingerprint_at.tzinfo is None:
            prev_same_fingerprint_at = prev_same_fingerprint_at.replace(tzinfo=timezone.utc)
        if now.tzinfo is None:
            now = now.replace(tzinfo=timezone.utc)
        delta = (now - prev_same_fingerprint_at).total_seconds()
        if 0 <= delta <= float(rfs):
            return False, "repeat_fingerprint_time"

    if (
        settings_obj.repeat_max_notifications_per_fingerprint is not None
        and settings_obj.repeat_max_notifications_window_minutes is not None
        and prior_dispatched_same_fp_in_window
        >= settings_obj.repeat_max_notifications_per_fingerprint
    ):
        return False, "repeat_fingerprint_count"

    return True, None


def diff_fingerprint_prefix(dfp: str, n: int = 16) -> str:
    return dfp[:n] if dfp else ""
