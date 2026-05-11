"""Integration test for POST /monitors/{id}/visual/captures/now (V-2)."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.api.v1.schemas.monitor import MonitorVisualCaptureResponse
from app.core.exceptions import AppException, NotFoundError, ValidationError
from app.services import monitor_service


def _capture_response(monitor_id, *, is_diagnostic: bool = False) -> MonitorVisualCaptureResponse:
    return MonitorVisualCaptureResponse(
        id=str(uuid4()),
        monitor_id=str(monitor_id),
        check_id=None,
        captured_at=datetime.now(timezone.utc),
        width_px=1280,
        height_px=720,
        viewport_width=1280,
        viewport_height=720,
        full_page=False,
        perceptual_hash_hex="0123456789abcdef",
        dhash_algo="dhash",
        is_diagnostic=is_diagnostic,
    )


@pytest.mark.asyncio
@pytest.mark.integration
async def test_visual_capture_now_success(async_client, monkeypatch) -> None:
    monitor_id = uuid4()
    seen: dict[str, object] = {}

    async def _trigger(mid, uid, db, redis):
        seen["mid"] = mid
        seen["uid"] = uid
        return _capture_response(mid)

    monkeypatch.setattr(monitor_service, "trigger_visual_capture_now", _trigger)

    response = await async_client.post(
        f"/api/v1/monitors/{monitor_id}/visual/captures/now",
    )
    assert response.status_code == 200, response.text
    body = response.json()
    assert body["status"] == "success"
    # Authenticated user id propagated to the service layer.
    assert seen["uid"] == 1
    assert str(seen["mid"]) == str(monitor_id)
    # Newly created capture is NOT diagnostic — capture-now is operator-driven.
    assert body["data"]["isDiagnostic"] is False
    assert body["data"]["monitorId"] == str(monitor_id)


@pytest.mark.asyncio
@pytest.mark.integration
async def test_visual_capture_now_returns_422_when_capability_disabled(
    async_client, monkeypatch,
) -> None:
    monitor_id = uuid4()

    async def _trigger(mid, uid, db, redis):
        raise ValidationError(
            code="VISUAL_CHANGE_DISABLED",
            message="visual_change capability is not enabled for this monitor",
        )

    monkeypatch.setattr(monitor_service, "trigger_visual_capture_now", _trigger)
    response = await async_client.post(
        f"/api/v1/monitors/{monitor_id}/visual/captures/now",
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"]["code"] == "VISUAL_CHANGE_DISABLED"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_visual_capture_now_returns_404_when_monitor_missing(
    async_client, monkeypatch,
) -> None:
    monitor_id = uuid4()

    async def _trigger(mid, uid, db, redis):
        raise NotFoundError(code="MONITOR_NOT_FOUND", message="Monitor not found")

    monkeypatch.setattr(monitor_service, "trigger_visual_capture_now", _trigger)
    response = await async_client.post(
        f"/api/v1/monitors/{monitor_id}/visual/captures/now",
    )
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "MONITOR_NOT_FOUND"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_visual_capture_now_returns_429_when_rate_limited(
    async_client, monkeypatch,
) -> None:
    monitor_id = uuid4()

    async def _trigger(mid, uid, db, redis):
        raise AppException(
            code="VISUAL_CAPTURE_RATE_LIMITED",
            message="Manual capture limit reached for this monitor. Try again in 42 seconds.",
            status_code=429,
        )

    monkeypatch.setattr(monitor_service, "trigger_visual_capture_now", _trigger)
    response = await async_client.post(
        f"/api/v1/monitors/{monitor_id}/visual/captures/now",
    )
    assert response.status_code == 429
    body = response.json()
    assert body["error"]["code"] == "VISUAL_CAPTURE_RATE_LIMITED"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_visual_capture_now_returns_502_when_screenshot_service_failed(
    async_client, monkeypatch,
) -> None:
    monitor_id = uuid4()

    async def _trigger(mid, uid, db, redis):
        raise AppException(
            code="VISUAL_CAPTURE_FAILED",
            message="Screenshot service did not return a usable image",
            status_code=502,
        )

    monkeypatch.setattr(monitor_service, "trigger_visual_capture_now", _trigger)
    response = await async_client.post(
        f"/api/v1/monitors/{monitor_id}/visual/captures/now",
    )
    assert response.status_code == 502
    body = response.json()
    assert body["error"]["code"] == "VISUAL_CAPTURE_FAILED"
