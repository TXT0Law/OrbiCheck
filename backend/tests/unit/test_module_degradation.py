"""Unit tests for module graceful degradation and transformers."""

import pytest

from app.services.transformers import (
    transform_features,
    transform_quality,
    transform_screenshot,
)


@pytest.mark.unit
def test_features_no_api_key_returns_success_true() -> None:
    """Features with no BuiltWith data returns valid structure with source."""
    raw = {
        "success": True,
        "Results": [],
        "features": [],
        "data": {"note": "BuiltWith API key not configured."},
    }
    result = transform_features(raw, all_raw=None)
    assert "features" in result
    assert result["features"] == []
    assert result.get("source") in ("none", "builtwith")


@pytest.mark.unit
def test_features_fallback_to_tech_stack() -> None:
    """Empty features with tech-stack populates from Wappalyzer."""
    raw_features = {"success": True, "Results": [], "features": []}
    all_raw = {
        "features": raw_features,
        "tech-stack": {
            "data": {
                "technologies": [
                    {"name": "React", "categories": [{"name": "JavaScript"}], "confidence": 90},
                ],
            },
        },
    }
    result = transform_features(raw_features, all_raw=all_raw)
    assert len(result["features"]) >= 1
    assert result["features"][0]["name"] == "React"
    assert result.get("source") == "wappalyzer"


@pytest.mark.unit
def test_features_no_fallback_when_builtwith_has_data() -> None:
    """Features from BuiltWith when Results present, not tech-stack."""
    raw_features = {
        "success": True,
        "Results": [
            {"Result": {"Paths": [{"Technologies": [{"Name": "nginx"}]}]}},
        ],
        "features": [],
    }
    all_raw = {
        "features": raw_features,
        "tech-stack": {"data": {"technologies": [{"name": "React"}]}},
    }
    result = transform_features(raw_features, all_raw=all_raw)
    assert result.get("source") == "builtwith"


@pytest.mark.unit
def test_transform_features_handles_empty_tech_stack() -> None:
    """Empty features and empty tech-stack returns empty."""
    raw = {"success": True, "Results": [], "features": []}
    all_raw = {"features": raw, "tech-stack": {"data": {"technologies": []}}}
    result = transform_features(raw, all_raw=all_raw)
    assert result["features"] == []
    assert result.get("source") == "none"


@pytest.mark.unit
def test_transform_quality_handles_missing_key() -> None:
    """Quality with note (no API key) returns valid structure."""
    raw = {
        "success": True,
        "data": {"categories": [], "note": "Google Cloud API key not configured."},
    }
    result = transform_quality(raw)
    assert "categories" in result
    assert result["categories"] == []


@pytest.mark.unit
def test_transform_screenshot_handles_null_image() -> None:
    """Screenshot with null image returns valid structure."""
    raw = {"image": None}
    result = transform_screenshot(raw)
    assert "imageUrl" in result
    assert result["imageUrl"] == ""
