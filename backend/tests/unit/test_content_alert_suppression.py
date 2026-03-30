"""Unit tests for content_change notification suppression policy (pure logic + clock)."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

import pytest

from app.services.content_alert_suppression import (
    ContentAlertSuppressionSettings,
    decide_content_change_notification,
    get_content_alert_suppression_settings,
)


@pytest.mark.unit
def test_alert_only_medium_or_large_suppresses_small() -> None:
    st = ContentAlertSuppressionSettings(
        alert_only_medium_or_large=True,
        repeat_fingerprint_seconds=None,
        repeat_max_notifications_per_fingerprint=None,
        repeat_max_notifications_window_minutes=None,
    )
    now = datetime(2026, 3, 25, 12, 0, 0, tzinfo=timezone.utc)
    d, reason = decide_content_change_notification(
        change_category="small",
        diff_fingerprint="ab",
        settings_obj=st,
        now=now,
        prev_same_fingerprint_at=None,
        prior_dispatched_same_fp_in_window=0,
    )
    assert d is False
    assert reason == "small_category"


@pytest.mark.unit
def test_medium_still_notifies_when_only_ml_on() -> None:
    st = ContentAlertSuppressionSettings(
        alert_only_medium_or_large=True,
        repeat_fingerprint_seconds=None,
        repeat_max_notifications_per_fingerprint=None,
        repeat_max_notifications_window_minutes=None,
    )
    now = datetime(2026, 3, 25, 12, 0, 0, tzinfo=timezone.utc)
    d, reason = decide_content_change_notification(
        change_category="medium",
        diff_fingerprint="ab",
        settings_obj=st,
        now=now,
        prev_same_fingerprint_at=None,
        prior_dispatched_same_fp_in_window=0,
    )
    assert d is True
    assert reason is None


@pytest.mark.unit
def test_repeat_fingerprint_time_suppresses() -> None:
    st = ContentAlertSuppressionSettings(
        alert_only_medium_or_large=False,
        repeat_fingerprint_seconds=600,
        repeat_max_notifications_per_fingerprint=None,
        repeat_max_notifications_window_minutes=None,
    )
    now = datetime(2026, 3, 25, 12, 0, 0, tzinfo=timezone.utc)
    prev = now - timedelta(seconds=120)
    d, reason = decide_content_change_notification(
        change_category="large",
        diff_fingerprint="ff",
        settings_obj=st,
        now=now,
        prev_same_fingerprint_at=prev,
        prior_dispatched_same_fp_in_window=0,
    )
    assert d is False
    assert reason == "repeat_fingerprint_time"


@pytest.mark.unit
def test_repeat_fingerprint_time_allows_after_window() -> None:
    st = ContentAlertSuppressionSettings(
        alert_only_medium_or_large=False,
        repeat_fingerprint_seconds=600,
        repeat_max_notifications_per_fingerprint=None,
        repeat_max_notifications_window_minutes=None,
    )
    now = datetime(2026, 3, 25, 12, 0, 0, tzinfo=timezone.utc)
    prev = now - timedelta(seconds=700)
    d, _ = decide_content_change_notification(
        change_category="large",
        diff_fingerprint="ff",
        settings_obj=st,
        now=now,
        prev_same_fingerprint_at=prev,
        prior_dispatched_same_fp_in_window=0,
    )
    assert d is True


@pytest.mark.unit
def test_count_suppression() -> None:
    st = ContentAlertSuppressionSettings(
        alert_only_medium_or_large=False,
        repeat_fingerprint_seconds=None,
        repeat_max_notifications_per_fingerprint=2,
        repeat_max_notifications_window_minutes=60,
    )
    now = datetime(2026, 3, 25, 12, 0, 0, tzinfo=timezone.utc)
    d, reason = decide_content_change_notification(
        change_category="large",
        diff_fingerprint="ff",
        settings_obj=st,
        now=now,
        prev_same_fingerprint_at=None,
        prior_dispatched_same_fp_in_window=2,
    )
    assert d is False
    assert reason == "repeat_fingerprint_count"


@pytest.mark.unit
def test_get_settings_alert_only_from_categories() -> None:
    caps = {
        "content_change": {
            "thresholds": {
                "alertOnlyCategories": ["medium", "large"],
            }
        }
    }
    st = get_content_alert_suppression_settings(caps)
    assert st.alert_only_medium_or_large is True


@pytest.mark.unit
def test_get_settings_dedup_zero_disables_time_rule() -> None:
    caps = {"content_change": {"thresholds": {"dedupWindowSeconds": 0}}}
    st = get_content_alert_suppression_settings(caps)
    assert st.repeat_fingerprint_seconds is None
