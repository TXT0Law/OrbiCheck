"""Extra unit tests: validate_content_response and get_content_thresholds."""

from __future__ import annotations

import httpx
import pytest

from app.services.content_change_helpers import (
    get_content_thresholds,
    validate_content_response,
)


def test_validate_content_rejects_image() -> None:
    r = httpx.Response(200, headers={"content-type": "image/png"})
    with pytest.raises(ValueError, match="not suitable"):
        validate_content_response(r)


def test_get_content_thresholds_defaults() -> None:
    th = get_content_thresholds({})
    assert th.alert_on_change is True
    assert th.min_change_size_bytes == 0
    assert th.normalize_volatile_tokens is True
    assert th.suppress_degraded_page_changes is True


def test_get_content_thresholds_from_nested() -> None:
    caps = {
        "content_change": {
            "thresholds": {"alertOnChange": False, "minChangeSizeBytes": 42},
        }
    }
    th = get_content_thresholds(caps)
    assert th.alert_on_change is False
    assert th.min_change_size_bytes == 42
