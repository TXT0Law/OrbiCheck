"""V-5 unit tests: visual_change capture must persist on failure paths.

These tests cover the new ``is_diagnostic=True`` flow added in V-1 so that
operators can SEE what OrbiCheck sees when the HTTP probe failed (bot
walls, 5xx, TLS handshake errors).

Key invariants:
1. A failed probe with ``visual_change.thresholds.captureOnFailure=true``
   still calls ``call_screenshot_service`` and writes a row.
2. The persisted ``MonitorVisualCapture`` row has ``is_diagnostic=True``.
3. No ``MonitorVisualChange`` row is recorded for diagnostic captures —
   they must never poison the dHash baseline or fire change alerts.
"""

from __future__ import annotations

import base64
from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest

from app.core.monitor_defaults import capabilities_from_enabled_list
from app.models.monitor import (
    Monitor,
    MonitorCheck,
    MonitorStatus,
    MonitorVisualCapture,
    MonitorVisualChange,
)
from app.services import monitor_service

SINGLE_PIXEL_PNG_B64 = (
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO5qS2kAAAAASUVORK5CYII="
)


def _decoded_screenshot_payload() -> dict[str, str]:
    raw = base64.b64decode(SINGLE_PIXEL_PNG_B64)
    return {"success": True, "image": base64.b64encode(raw).decode()}


def _build_monitor(*, capture_on_failure: bool = True) -> Monitor:
    caps = capabilities_from_enabled_list(["visual_change"])
    if capture_on_failure is False:
        caps["visual_change"]["thresholds"]["captureOnFailure"] = False
    return Monitor(
        id=uuid4(),
        user_id=1,
        display_name="diagnostic-target",
        url="https://example.com",
        capabilities=caps,
        enabled_capabilities=["visual_change"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.DOWN,
        tags=[],
    )


def _stub_db_with(prev_capture: MonitorVisualCapture | None = None) -> tuple[AsyncMock, list[object]]:
    added: list[object] = []

    def add_side_effect(obj: object) -> None:
        added.append(obj)

    async def flush_side_effect() -> None:
        for obj in added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()

    db = AsyncMock()
    db.add = MagicMock(side_effect=add_side_effect)
    db.flush = AsyncMock(side_effect=flush_side_effect)
    db.execute = AsyncMock(
        return_value=MagicMock(
            scalar_one_or_none=MagicMock(return_value=prev_capture),
        ),
    )
    return db, added


@pytest.mark.asyncio
@pytest.mark.unit
async def test_diagnostic_capture_persists_with_is_diagnostic_true(monkeypatch) -> None:
    monitor = _build_monitor()
    failing_check = MonitorCheck(
        id=uuid4(),
        monitor_id=monitor.id,
        success=False,
        response_time_ms=12_345.0,
        content_changed=False,
        evaluated_capabilities=["visual_change"],
    )
    db, added = _stub_db_with(prev_capture=None)

    monkeypatch.setattr(
        monitor_service,
        "call_screenshot_service",
        AsyncMock(return_value=_decoded_screenshot_payload()),
    )
    monkeypatch.setattr(monitor_service, "compute_dhash_hex", lambda _png: "0123456789abcdef")
    alert_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(monitor_service.alert_service, "evaluate_and_dispatch_alert", alert_mock)

    capture = await monitor_service._run_visual_change_capture(
        monitor, failing_check, db, AsyncMock(), is_diagnostic=True,
    )

    visual_rows = [obj for obj in added if isinstance(obj, MonitorVisualCapture)]
    assert len(visual_rows) == 1, "expected exactly one capture row to be stored"
    assert visual_rows[0].is_diagnostic is True
    assert capture is visual_rows[0]
    assert not any(isinstance(obj, MonitorVisualChange) for obj in added), (
        "diagnostic capture must not record a visual change row"
    )
    alert_mock.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_diagnostic_capture_ignores_prior_baseline_for_alerts(monkeypatch) -> None:
    """Diagnostic captures must not trigger visual_change alerts even if a baseline exists."""
    monitor = _build_monitor()
    failing_check = MonitorCheck(
        id=uuid4(),
        monitor_id=monitor.id,
        success=False,
        response_time_ms=400.0,
        content_changed=False,
        evaluated_capabilities=["visual_change"],
    )
    prev = MonitorVisualCapture(
        id=uuid4(),
        monitor_id=monitor.id,
        check_id=uuid4(),
        image_png=b"prev",
        width_px=10,
        height_px=10,
        viewport_width=1280,
        viewport_height=720,
        full_page=False,
        perceptual_hash_hex="0000000000000000",
        dhash_algo="dhash",
        is_diagnostic=False,
    )
    db, added = _stub_db_with(prev_capture=prev)
    monkeypatch.setattr(
        monitor_service,
        "call_screenshot_service",
        AsyncMock(return_value=_decoded_screenshot_payload()),
    )
    monkeypatch.setattr(monitor_service, "compute_dhash_hex", lambda _png: "ffffffffffffffff")
    alert_mock = AsyncMock(return_value=None)
    monkeypatch.setattr(monitor_service.alert_service, "evaluate_and_dispatch_alert", alert_mock)

    await monitor_service._run_visual_change_capture(
        monitor, failing_check, db, AsyncMock(), is_diagnostic=True,
    )

    assert not any(isinstance(obj, MonitorVisualChange) for obj in added), (
        "diagnostic capture must NEVER produce a visual_change row"
    )
    alert_mock.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_get_visual_thresholds_capture_on_failure_default_true() -> None:
    """A monitor whose visual_change config omits captureOnFailure opts in by default."""
    caps = capabilities_from_enabled_list(["visual_change"])
    caps["visual_change"]["thresholds"].pop("captureOnFailure", None)
    monitor = Monitor(
        id=uuid4(),
        user_id=1,
        display_name="legacy",
        url="https://legacy.example.com",
        capabilities=caps,
        enabled_capabilities=["visual_change"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.PENDING,
        tags=[],
    )
    thresholds = monitor_service.get_visual_thresholds(monitor.capabilities)
    assert thresholds.capture_on_failure is True


@pytest.mark.asyncio
@pytest.mark.unit
async def test_capture_now_returns_capture_for_failing_target(monkeypatch) -> None:
    monitor = _build_monitor()
    db = AsyncMock()
    db.get = AsyncMock(return_value=monitor)
    added: list[object] = []
    db.add = MagicMock(side_effect=lambda obj: added.append(obj))

    async def flush() -> None:
        for obj in added:
            if getattr(obj, "id", None) is None:
                obj.id = uuid4()

    db.flush = AsyncMock(side_effect=flush)
    db.execute = AsyncMock(
        return_value=MagicMock(scalar_one_or_none=MagicMock(return_value=None)),
    )

    redis = AsyncMock()
    redis.incr = AsyncMock(return_value=1)
    redis.expire = AsyncMock()
    redis.ttl = AsyncMock(return_value=60)

    monkeypatch.setattr(
        monitor_service,
        "call_screenshot_service",
        AsyncMock(return_value=_decoded_screenshot_payload()),
    )
    monkeypatch.setattr(monitor_service, "compute_dhash_hex", lambda _png: "abcdef0123456789")

    response = await monitor_service.trigger_visual_capture_now(
        monitor.id, 1, db, redis,
    )

    assert response.id, "service must return a populated capture response"
    assert response.is_diagnostic is False
    captures = [obj for obj in added if isinstance(obj, MonitorVisualCapture)]
    assert len(captures) == 1
    assert captures[0].is_diagnostic is False
