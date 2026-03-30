"""Unit tests for content_change noise suppression helpers."""

from __future__ import annotations

import pytest

from app.core.config import settings
from app.services.content_change_helpers import (
    compile_custom_normalization_rules,
    compute_content_fingerprint,
    compute_diff_summary,
    compute_unified_diff_fingerprint,
    detect_degraded_page,
    get_content_thresholds,
    get_effective_dedup_window_seconds,
    normalize_body_for_comparison,
)


@pytest.mark.unit
def test_normalize_replaces_uuids() -> None:
    a = "x 550e8400-e29b-41d4-a716-446655440000 y"
    b = "x 660e8400-e29b-41d4-a716-446655440001 y"
    assert normalize_body_for_comparison(a) == normalize_body_for_comparison(b)


@pytest.mark.unit
def test_normalize_long_hex() -> None:
    a = "k=" + "a" * 40
    b = "k=" + "b" * 40
    assert normalize_body_for_comparison(a) == normalize_body_for_comparison(b)


@pytest.mark.unit
def test_fingerprint_stable_when_only_uuid_differs() -> None:
    a = "<p>550e8400-e29b-41d4-a716-446655440000</p>"
    b = "<p>660e8400-e29b-41d4-a716-446655440001</p>"
    assert compute_content_fingerprint(a, normalize=True) == compute_content_fingerprint(
        b, normalize=True
    )


@pytest.mark.unit
def test_fingerprint_differs_when_meaningful_change() -> None:
    a = "<p>hello</p>"
    b = "<p>goodbye</p>"
    assert compute_content_fingerprint(a, normalize=True) != compute_content_fingerprint(
        b, normalize=True
    )


@pytest.mark.unit
def test_detect_degraded_captcha_like() -> None:
    html = "<html><title>Attention Required</title><body>x</body></html>"
    deg, reason = detect_degraded_page(html)
    assert deg is True
    assert reason is not None


@pytest.mark.unit
def test_detect_degraded_clean_page() -> None:
    html = "<html><title>Our product pricing</title><body>ok</body></html>"
    deg, _ = detect_degraded_page(html)
    assert deg is False


@pytest.mark.unit
def test_get_content_thresholds_noise_defaults() -> None:
    th = get_content_thresholds({})
    assert th.normalize_volatile_tokens is True
    assert th.suppress_degraded_page_changes is True


@pytest.mark.unit
def test_compile_custom_normalization_rules() -> None:
    caps = {
        "content_change": {
            "thresholds": {
                "normalizationRules": [
                    {"pattern": r"foo\d+", "replacement": "X"},
                    {"pattern": "[invalid", "replacement": "y"},
                ]
            }
        }
    }
    rules = compile_custom_normalization_rules(caps)
    assert len(rules) == 1
    assert rules[0][0].sub("X", "a foo123 b") == "a X b"


@pytest.mark.unit
def test_unified_diff_fingerprint_stable() -> None:
    a = "<p>a</p>"
    b = "<p>b</p>"
    fp1 = compute_unified_diff_fingerprint(a, b)
    fp2 = compute_unified_diff_fingerprint(a, b)
    assert fp1 == fp2
    assert len(fp1) == 64


@pytest.mark.unit
def test_get_effective_dedup_window_seconds_default() -> None:
    assert get_effective_dedup_window_seconds(None) == settings.MONITOR_CHANGE_DEDUP_WINDOW_SECONDS


@pytest.mark.unit
def test_get_effective_dedup_window_seconds_override() -> None:
    caps = {"content_change": {"thresholds": {"dedupWindowSeconds": 120}}}
    assert get_effective_dedup_window_seconds(caps) == 120


@pytest.mark.unit
def test_compute_diff_summary_preview_line() -> None:
    ds = compute_diff_summary("line1\n", "line2\n")
    assert "previewLine" in ds
    assert isinstance(ds["previewLine"], str)
    assert len(ds["previewLine"]) > 0


def test_get_content_thresholds_noise_overrides() -> None:
    caps = {
        "content_change": {
            "thresholds": {
                "normalizeVolatileTokens": False,
                "suppressDegradedPageChanges": False,
            }
        }
    }
    th = get_content_thresholds(caps)
    assert th.normalize_volatile_tokens is False
    assert th.suppress_degraded_page_changes is False
