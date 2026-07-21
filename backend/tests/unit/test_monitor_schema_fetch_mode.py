"""B-6 + B-7: Pydantic guard rails around C-5 fetchMode / fetchOptions.

These tests exercise:
* The new ``fetch_mode`` / ``fetch_options`` fields on ContentThresholds*
  schemas — the legacy frontend that omits both still validates (B-6).
* The model_validator on MonitorCreateRequest / MonitorUpdateRequest that
  rejects sub-300s intervals when the operator switches to browser fetch.
"""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.v1.schemas.monitor import (
    MIN_BROWSER_FETCH_INTERVAL_SECONDS,
    ContentFetchOptionsSchema,
    ContentThresholdsSchema,
    ContentThresholdsUpdateSchema,
    MonitorCreateRequest,
    MonitorUpdateRequest,
    VisualThresholdsSchema,
)


@pytest.mark.unit
def test_content_thresholds_accepts_legacy_payload_without_fetch_mode() -> None:
    """B-6: existing JSONB blobs that omit fetchMode/fetchOptions still parse."""
    parsed = ContentThresholdsSchema.model_validate(
        {"alertOnChange": True, "minChangeSizeBytes": 200}
    )
    assert parsed.fetch_mode == "http"
    assert parsed.fetch_options is None


@pytest.mark.unit
def test_content_thresholds_accepts_browser_with_fetch_options() -> None:
    """B-6: the browser path round-trips fetchOptions camelCase keys."""
    parsed = ContentThresholdsSchema.model_validate(
        {
            "alertOnChange": True,
            "fetchMode": "browser",
            "fetchOptions": {
                "waitForSelector": "main h1",
                "waitMs": 250,
                "viewportWidth": 1024,
                "viewportHeight": 800,
            },
        }
    )
    assert parsed.fetch_mode == "browser"
    assert parsed.fetch_options == ContentFetchOptionsSchema(
        wait_for_selector="main h1",
        wait_ms=250,
        viewport_width=1024,
        viewport_height=800,
    )


@pytest.mark.unit
def test_content_thresholds_update_accepts_partial_browser_switch() -> None:
    """B-6: PATCH that only sets fetchMode without fetchOptions works."""
    parsed = ContentThresholdsUpdateSchema.model_validate(
        {"fetchMode": "browser"}
    )
    assert parsed.fetch_mode == "browser"
    assert parsed.fetch_options is None


@pytest.mark.unit
def test_fetch_options_rejects_oversized_wait_ms() -> None:
    """B-6: the schema caps waitMs at 10s to mirror the scan-service ceiling."""
    with pytest.raises(ValidationError) as excinfo:
        ContentFetchOptionsSchema.model_validate({"waitMs": 99_999})
    assert "less than or equal to 10000" in str(excinfo.value).lower() or (
        "10000" in str(excinfo.value)
    )


@pytest.mark.unit
def test_create_request_rejects_browser_mode_with_short_interval() -> None:
    """A 60-second monitor with browser fetch must fail validation."""
    payload = {
        "displayName": "shopify",
        "url": "https://example.com",
        "enabledCapabilities": ["content_change"],
        "intervalSeconds": 60,
        "capabilities": {
            "content_change": {
                "enabled": True,
                "thresholds": {"fetchMode": "browser"},
            }
        },
    }
    with pytest.raises(ValidationError) as excinfo:
        MonitorCreateRequest.model_validate(payload)
    msg = str(excinfo.value)
    assert "fetchMode='browser'" in msg
    assert str(MIN_BROWSER_FETCH_INTERVAL_SECONDS) in msg


@pytest.mark.unit
def test_create_request_accepts_browser_mode_at_min_interval() -> None:
    """B-7: exactly 300s is allowed (boundary)."""
    payload = {
        "displayName": "edge case",
        "url": "https://example.com",
        "enabledCapabilities": ["content_change"],
        "intervalSeconds": MIN_BROWSER_FETCH_INTERVAL_SECONDS,
        "capabilities": {
            "content_change": {
                "enabled": True,
                "thresholds": {"fetchMode": "browser"},
            }
        },
    }
    parsed = MonitorCreateRequest.model_validate(payload)
    assert parsed.interval_seconds == MIN_BROWSER_FETCH_INTERVAL_SECONDS


@pytest.mark.unit
def test_create_request_allows_short_interval_in_http_mode() -> None:
    """B-7: HTTP mode preserves the legacy 5-3600s interval range."""
    payload = {
        "displayName": "fast",
        "url": "https://example.com",
        "enabledCapabilities": ["content_change"],
        "intervalSeconds": 60,
        "capabilities": {
            "content_change": {
                "enabled": True,
                "thresholds": {"fetchMode": "http"},
            }
        },
    }
    parsed = MonitorCreateRequest.model_validate(payload)
    assert parsed.interval_seconds == 60


@pytest.mark.unit
def test_visual_thresholds_reject_unknown_browser_step_action() -> None:
    with pytest.raises(ValidationError) as excinfo:
        VisualThresholdsSchema.model_validate(
            {"steps": [{"action": "evilop", "payload": "x"}]}
        )
    assert "evilop" in str(excinfo.value)


@pytest.mark.unit
def test_visual_thresholds_validates_step_fields_by_action() -> None:
    parsed = VisualThresholdsSchema.model_validate(
        {
            "waitFor": {"selector": "main.ready", "timeoutMs": 500},
            "steps": [
                {"action": "goto", "url": "https://example.com/login"},
                {"action": "wait", "ms": 250},
                {"action": "scroll"},
                {"action": "click", "selector": "button"},
            ],
        }
    )
    assert parsed.wait_for is not None
    assert parsed.wait_for.timeout_ms == 500
    assert parsed.steps is not None
    assert len(parsed.steps) == 4


@pytest.mark.unit
def test_visual_thresholds_reject_type_step_value_too_long() -> None:
    with pytest.raises(ValidationError) as excinfo:
        VisualThresholdsSchema.model_validate(
            {
                "steps": [
                    {
                        "action": "type",
                        "selector": "#password",
                        "value": "x" * 501,
                    }
                ]
            }
        )
    assert "500" in str(excinfo.value)


@pytest.mark.unit
def test_update_request_rejects_browser_switch_with_explicit_short_interval() -> None:
    """B-7: PATCH that lowers interval below 300s while flipping to browser is 422."""
    with pytest.raises(ValidationError):
        MonitorUpdateRequest.model_validate(
            {
                "intervalSeconds": 60,
                "capabilities": {
                    "content_change": {
                        "thresholds": {"fetchMode": "browser"},
                    }
                },
            }
        )


@pytest.mark.unit
def test_update_request_allows_browser_switch_without_interval_change() -> None:
    """B-7: PATCH that only flips fetchMode (no intervalSeconds) is accepted at the schema layer.

    The defensive runtime guard in ``monitor_service`` catches the case where
    the existing monitor is already < 300s — see the demote path in
    execute_check.
    """
    parsed = MonitorUpdateRequest.model_validate(
        {
            "capabilities": {
                "content_change": {
                    "thresholds": {"fetchMode": "browser"},
                }
            }
        }
    )
    assert parsed.interval_seconds is None
