"""Unit tests for transform_quality."""

from app.services.transformers import transform_quality


class TestTransformQuality:
    def test_transforms_full_lighthouse_data(self):
        raw = {
            "lighthouseResult": {
                "categories": {
                    "performance": {"id": "performance", "title": "Performance", "score": 0.9},
                    "accessibility": {"id": "accessibility", "title": "Accessibility", "score": 0.85},
                    "best-practices": {"id": "best-practices", "title": "Best Practices", "score": 1.0},
                    "seo": {"id": "seo", "title": "SEO", "score": 0.95},
                },
                "fetchTime": "2024-01-01T12:00:00.000Z",
                "requestedUrl": "https://example.com",
                "finalUrl": "https://example.com/",
                "audits": {},
            },
        }
        result = transform_quality(raw)
        assert len(result["categories"]) == 4
        assert result["categories"][0]["id"] == "performance"
        assert result["categories"][0]["displayScore"] == 90
        assert result["categories"][0]["score"] == 0.9
        assert result["fetchTime"] == "2024-01-01T12:00:00.000Z"
        assert result["requestedUrl"] == "https://example.com"

    def test_handles_missing_categories(self):
        raw = {"lighthouseResult": {"categories": {}}}
        result = transform_quality(raw)
        assert result["categories"] == []
        assert result["audits"] == []

    def test_handles_missing_lighthouse_result(self):
        raw = {}
        result = transform_quality(raw)
        assert result["categories"] == []
        assert result["audits"] == []
        assert result["requestedUrl"] == ""
        assert result["finalUrl"] == ""

    def test_display_score_is_rounded_percentage(self):
        raw = {
            "lighthouseResult": {
                "categories": {
                    "performance": {"id": "performance", "title": "P", "score": 0.856},
                },
                "audits": {},
            },
        }
        result = transform_quality(raw)
        assert result["categories"][0]["displayScore"] == 86

    def test_handles_null_scores(self):
        raw = {
            "lighthouseResult": {
                "categories": {
                    "performance": {"id": "performance", "title": "P", "score": None},
                },
                "audits": {},
            },
        }
        result = transform_quality(raw)
        assert result["categories"][0]["score"] is None
        assert result["categories"][0]["displayScore"] == 0

    def test_extracts_key_audits(self):
        raw = {
            "lighthouseResult": {
                "categories": {},
                "audits": {
                    "first-contentful-paint": {
                        "title": "First Contentful Paint",
                        "displayValue": "1.2 s",
                        "score": 0.9,
                        "numericValue": 1200,
                    },
                    "largest-contentful-paint": {
                        "title": "LCP",
                        "displayValue": "2.5 s",
                        "score": 0.8,
                        "numericValue": 2500,
                    },
                },
            },
        }
        result = transform_quality(raw)
        assert len(result["audits"]) == 2
        assert result["audits"][0]["id"] == "first-contentful-paint"
        assert result["audits"][0]["displayValue"] == "1.2 s"
        assert result["audits"][0]["score"] == 0.9

    def test_handles_runtime_error(self):
        raw = {
            "lighthouseResult": {"categories": {}, "audits": {}},
            "runtimeError": {"message": "Page load failed"},
        }
        result = transform_quality(raw)
        assert result["runtimeError"] is not None

    def test_handles_api_key_missing_error(self):
        raw = {"success": False, "error": "GOOGLE_CLOUD_API_KEY not configured"}
        result = transform_quality(raw)
        assert result["categories"] == []
        assert result["audits"] == []
        assert result["runtimeError"] == "GOOGLE_CLOUD_API_KEY not configured"

    def test_handles_error_key(self):
        raw = {"error": "Some error", "data": {}}
        result = transform_quality(raw)
        assert result["categories"] == []
        assert result["runtimeError"] == "Some error"
