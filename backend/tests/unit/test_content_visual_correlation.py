"""content_visual_correlation helpers."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.models.monitor import MonitorVisualCapture
from app.services.content_visual_correlation import (
    get_content_visual_correlation_window_seconds,
    pick_nearest_capture_in_window,
)


def test_get_window_default() -> None:
    assert get_content_visual_correlation_window_seconds(None) == 120


def test_pick_nearest_prefers_smaller_delta() -> None:
    base = datetime(2026, 3, 25, 12, 0, 0, tzinfo=timezone.utc)
    a = MonitorVisualCapture(
        id=uuid4(),
        monitor_id=uuid4(),
        check_id=None,
        captured_at=base,
        image_png=b"x",
        width_px=1,
        height_px=1,
        viewport_width=1280,
        viewport_height=720,
        full_page=False,
        perceptual_hash_hex=None,
        dhash_algo="dhash",
    )
    b = MonitorVisualCapture(
        id=uuid4(),
        monitor_id=a.monitor_id,
        check_id=None,
        captured_at=datetime(2026, 3, 25, 12, 0, 45, tzinfo=timezone.utc),
        image_png=b"x",
        width_px=1,
        height_px=1,
        viewport_width=1280,
        viewport_height=720,
        full_page=False,
        perceptual_hash_hex=None,
        dhash_algo="dhash",
    )
    target = datetime(2026, 3, 25, 12, 0, 10, tzinfo=timezone.utc)
    got = pick_nearest_capture_in_window(
        detected_at=target,
        window_seconds=120,
        candidates=[a, b],
    )
    assert got is not None
    assert got.id == a.id


def test_pick_nearest_respects_window() -> None:
    base = datetime(2026, 3, 25, 12, 0, 0, tzinfo=timezone.utc)
    a = MonitorVisualCapture(
        id=uuid4(),
        monitor_id=uuid4(),
        check_id=None,
        captured_at=base,
        image_png=b"x",
        width_px=1,
        height_px=1,
        viewport_width=1280,
        viewport_height=720,
        full_page=False,
        perceptual_hash_hex=None,
        dhash_algo="dhash",
    )
    got = pick_nearest_capture_in_window(
        detected_at=datetime(2026, 3, 25, 12, 10, 0, tzinfo=timezone.utc),
        window_seconds=60,
        candidates=[a],
    )
    assert got is None
