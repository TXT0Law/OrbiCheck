"""Unit tests for content change threshold evaluation."""

from __future__ import annotations


from app.core.config import settings
from app.services.content_change_helpers import (
    ContentThresholds,
    evaluate_content_threshold,
)


def test_evaluate_zero_threshold_always_met_when_alert_on() -> None:
    th = ContentThresholds(alert_on_change=True, min_change_size_bytes=0)
    assert evaluate_content_threshold({"totalDiffLines": 0}, 0, th) is True


def test_evaluate_alert_off_never_met() -> None:
    th = ContentThresholds(alert_on_change=False, min_change_size_bytes=0)
    assert evaluate_content_threshold({"totalDiffLines": 100}, 5000, th) is False


def test_evaluate_byte_delta_meets_threshold() -> None:
    th = ContentThresholds(alert_on_change=True, min_change_size_bytes=100)
    assert evaluate_content_threshold({"totalDiffLines": 1}, 150, th) is True


def test_evaluate_below_bytes_but_line_override() -> None:
    th = ContentThresholds(alert_on_change=True, min_change_size_bytes=500)
    assert (
        evaluate_content_threshold(
            {"totalDiffLines": settings.MIN_DIFF_LINES_OVERRIDE},
            10,
            th,
        )
        is True
    )


def test_evaluate_below_bytes_and_few_lines() -> None:
    th = ContentThresholds(alert_on_change=True, min_change_size_bytes=500)
    assert evaluate_content_threshold({"totalDiffLines": 2}, 10, th) is False


def test_evaluate_min_total_diff_lines_blocks_small_diff() -> None:
    th = ContentThresholds(
        alert_on_change=True,
        min_change_size_bytes=0,
        min_total_diff_lines=10,
    )
    assert evaluate_content_threshold({"totalDiffLines": 5}, 100, th) is False


def test_evaluate_min_total_diff_lines_overridden_by_byte_threshold() -> None:
    th = ContentThresholds(
        alert_on_change=True,
        min_change_size_bytes=100,
        min_total_diff_lines=10,
    )
    assert evaluate_content_threshold({"totalDiffLines": 5}, 200, th) is True


def test_evaluate_min_total_diff_lines_overridden_by_line_override() -> None:
    th = ContentThresholds(
        alert_on_change=True,
        min_change_size_bytes=500,
        min_total_diff_lines=10,
    )
    assert (
        evaluate_content_threshold(
            {"totalDiffLines": settings.MIN_DIFF_LINES_OVERRIDE},
            10,
            th,
        )
        is True
    )
