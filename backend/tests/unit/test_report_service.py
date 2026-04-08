from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.security_analyzer import SecurityScoreResult
from app.services.report_service import (
    _monitor_incidents,
    _recent_change_summary,
    _security_score_breakdown_dict,
    _sum_module_duration_ms,
    generate_recommendations,
    render_markdown,
    render_pdf,
)


def _sample_report_data() -> dict:
    return {
        "reportId": "report-1",
        "title": "Security Report - example.com",
        "generatedAt": "2026-03-27T00:00:00Z",
        "meta": {"scanDomain": "example.com", "scanUrl": "https://example.com", "score": 72},
        "scan": {
            "id": "scan-1",
            "domain": "example.com",
            "url": "https://example.com",
            "status": "completed",
            "scannedAt": "2026-03-27T00:00:00Z",
            "duration": "12.0s",
            "totalDurationMs": 12000,
            "detail": {
                "ssl": {"issuer": "Let's Encrypt", "validTo": "2026-12-31", "daysRemaining": 90},
                "tls": {"grade": "A"},
                "hsts": {"enabled": True},
                "headers": {
                    "securityChecks": [
                        {"name": "content-security-policy", "status": "pass", "value": "default-src 'self'"}
                    ]
                },
                "dns": {"a": ["203.0.113.10"], "mx": ["mail.example.com"], "ns": ["ns1.example.com"]},
                "ip": {"ip": "203.0.113.10", "country": "US"},
                "ports": {"entries": [{"port": 443, "service": "https"}]},
                "firewall": {"hasWaf": True},
                "threats": {},
                "techStack": {"technologies": [{"name": "Next.js"}]},
                "robotsTxt": {"robots": ["User-agent: *"]},
                "sitemap": {"items": ["/"]},
                "dnssec": {"enabled": True},
            },
            "securityScore": 72,
            "securityScoreBreakdown": {
                "category_scores": {
                    "transport": 24.0,
                    "http_security": 18.0,
                    "threat_intel": 15.0,
                    "infrastructure": 9.0,
                    "best_practices": 6.0,
                }
            },
            "severity": {"critical": 0, "high": 1, "medium": 1, "low": 0},
            "categorySummary": [],
            "keyFindings": [
                {
                    "severity": "high",
                    "title": "Missing HSTS preload",
                    "description": "HSTS preload is not enabled.",
                }
            ],
            "moduleSummary": [{"module": "ssl", "status": "success", "duration": 1234, "error": None}],
            "moduleErrors": [],
        },
        "monitor": None,
        "recommendations": [
            {
                "severity": "high",
                "title": "Enable HSTS preload",
                "description": "Submit the domain after validating HSTS readiness.",
            }
        ],
    }


@pytest.mark.unit
def test_generate_recommendations_detects_dangerous_ports() -> None:
    detail = {
        "ssl": {"daysRemaining": -1},
        "headers": {"securityChecks": [{"name": "content-security-policy", "status": "missing"}]},
        "ports": {"entries": [{"port": 21}, {"port": 443}]},
        "dnssec": {"enabled": False},
    }
    recommendations = generate_recommendations(detail, [])

    titles = [item["title"] for item in recommendations]
    assert "Replace expired SSL certificate" in titles
    assert "Restrict dangerous public ports" in titles


@pytest.mark.unit
def test_render_markdown_contains_expected_sections() -> None:
    markdown = render_markdown(_sample_report_data())

    assert "# Security Assessment Report - example.com" in markdown
    assert "## 1. Executive Summary" in markdown
    assert "## 5. Recommendations" in markdown
    assert "- Open ports: 443" in markdown


@pytest.mark.unit
def test_render_pdf_returns_non_empty_bytes() -> None:
    pdf_bytes = render_pdf(_sample_report_data())

    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert b"/Count 2" in pdf_bytes or pdf_bytes.count(b"/Type /Page") >= 2


@pytest.mark.unit
def test_recent_change_summary_handles_null_diff_summary() -> None:
    row = SimpleNamespace(
        detected_at=datetime(2026, 3, 27, tzinfo=timezone.utc),
        diff_summary=None,
    )

    result = _recent_change_summary(row)

    assert result["changeCategory"] == "unknown"
    assert result["linesAdded"] == 0
    assert result["linesRemoved"] == 0


@pytest.mark.unit
def test_monitor_incidents_counts_failure_transitions() -> None:
    rows = [
        SimpleNamespace(success=True),
        SimpleNamespace(success=False),
        SimpleNamespace(success=False),
        SimpleNamespace(success=True),
        SimpleNamespace(success=False),
        SimpleNamespace(success=True),
    ]

    assert _monitor_incidents(rows) == 2


@pytest.mark.unit
def test_security_score_breakdown_dict_uses_dataclass_conversion() -> None:
    breakdown = SecurityScoreResult(
        score=72,
        base_score=71.5,
        confidence=0.8,
        severity_cap_applied=None,
        category_scores={"transport": 24.0},
    )

    result = _security_score_breakdown_dict(breakdown)

    assert result == {
        "score": 72,
        "base_score": 71.5,
        "confidence": 0.8,
        "severity_cap_applied": None,
        "category_scores": {"transport": 24.0},
    }


@pytest.mark.unit
def test_sum_module_duration_ms_keeps_zero_value() -> None:
    modules = [
        SimpleNamespace(duration_ms=0),
        SimpleNamespace(duration_ms=None),
    ]

    assert _sum_module_duration_ms(modules) == 0
