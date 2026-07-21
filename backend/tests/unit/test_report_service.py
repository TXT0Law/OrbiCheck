from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace

import pytest

from app.services.security_analyzer import SecurityScoreResult
from app.services import report_service
from app.services.report_service import (
    _embed_chart,
    _group_tech_by_category,
    _monitor_incidents,
    _recent_change_summary,
    _safe_chart_bytes,
    _security_score_breakdown_dict,
    _ssl_chain_preview,
    _ssl_days_remaining_text,
    _sum_module_duration_ms,
    generate_recommendations,
    render_html,
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
                "ssl": {
                    "issuer": "Let's Encrypt",
                    "validTo": "2026-12-31",
                    "daysRemaining": 90,
                    "chainDetails": [
                        {
                            "subject": "example.com",
                            "issuer": "Let's Encrypt R3",
                            "order": 0,
                            "isTrusted": True,
                        },
                        {
                            "subject": "Let's Encrypt R3",
                            "issuer": "ISRG Root X1",
                            "order": 1,
                            "isTrusted": True,
                        },
                        {
                            "subject": "ISRG Root X1",
                            "issuer": "ISRG Root X1",
                            "order": 2,
                            "isTrusted": True,
                        },
                        {
                            "subject": "Extra Cert",
                            "issuer": "Should not appear",
                            "order": 3,
                            "isTrusted": False,
                        },
                    ],
                },
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
                "techStack": {
                    "technologies": [
                        {"name": "Next.js", "category": "JavaScript Framework", "confidence": 100},
                        {"name": "React", "category": "JavaScript Framework", "confidence": 100},
                        {"name": "Cloudflare", "category": "CDN", "confidence": 90},
                        {"name": "Nginx", "category": "Web Server", "confidence": 80},
                    ]
                },
                "robotsTxt": {"robots": ["User-agent: *"]},
                "sitemap": {"items": ["/"]},
                "dnssec": {"enabled": True},
            },
            "securityScore": 72,
            "securityScoreBreakdown": {
                "baseScore": 71.5,
                "confidence": 0.8,
                "severityCapApplied": None,
                "categoryScores": {
                    "transport": 24.0,
                    "httpSecurity": 18.0,
                    "threatIntel": 15.0,
                    "infrastructure": 9.0,
                    "bestPractices": 6.0,
                },
            },
            "severity": {"critical": 0, "high": 1, "medium": 1, "low": 0},
            "categorySummary": [
                {
                    "category": "security",
                    "label": "Security",
                    "modulesChecked": 8,
                    "issuesFound": 2,
                    "status": "warn",
                },
                {
                    "category": "network",
                    "label": "Network",
                    "modulesChecked": 3,
                    "issuesFound": 0,
                    "status": "pass",
                },
                {
                    "category": "content",
                    "label": "Content",
                    "modulesChecked": 4,
                    "issuesFound": 1,
                    "status": "warn",
                },
            ],
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
    # Score Breakdown table sourced from camelCase categoryScores.
    assert "| HTTP Security | 18.0 |" in markdown
    assert "| Best Practices | 6.0 |" in markdown
    # Category Summary table (T3.1: align with Web categorySummary).
    assert "### Category Summary" in markdown
    assert "| Security | 8 | 2 | Warn |" in markdown
    assert "| Network | 3 | 0 | Pass |" in markdown
    # SSL chain (T3.1: include chainDetails preview + daysRemaining text).
    assert "**Certificate Chain**" in markdown
    assert "Let's Encrypt R3" in markdown
    assert "90 days remaining" in markdown
    # Tech stack now grouped by category (T3.1: full list, not top-8 names).
    assert "**Tech Stack (by category)**" in markdown
    assert "_JavaScript Framework_" in markdown
    assert "_CDN_" in markdown
    assert "_Web Server_" in markdown


@pytest.mark.unit
def test_render_markdown_falls_back_to_legacy_breakdown_shape() -> None:
    """Backward-compat reader: legacy snake_case breakdown still renders."""
    payload = _sample_report_data()
    payload["scan"]["securityScoreBreakdown"] = {
        "category_scores": {
            "transport": 30.0,
            "http_security": 21.0,
            "threat_intel": 12.0,
            "infrastructure": 9.0,
            "best_practices": 6.0,
        }
    }

    markdown = render_markdown(payload)

    assert "| Transport | 30.0 |" in markdown
    assert "| HTTP Security | 21.0 |" in markdown
    assert "| Threat Intel | 12.0 |" in markdown
    assert "| Best Practices | 6.0 |" in markdown


@pytest.mark.unit
def test_render_html_includes_key_dom_landmarks() -> None:
    """T4.2: HTML report must surface the same key sections as the Web summary."""
    html = render_html(_sample_report_data())

    # Document scaffold + title.
    assert "<!doctype html>" in html.lower()
    assert "<title>example.com" in html.lower()
    # Score gauge + grade letter.
    assert "Security Score" in html
    assert "Grade C" in html  # 72 maps to "C" via _score_grade.
    # Severity grid.
    assert "Critical 0" in html
    assert "High 1" in html
    # Category Summary table mirrors the Web summary categorySummary.
    assert "<th>Category</th>" in html
    assert ">Security<" in html
    assert ">Network<" in html
    # Score Breakdown (camelCase keys rendered).
    assert "Transport" in html
    assert "HTTP Security" in html
    # Recommendations card.
    assert "Enable HSTS preload" in html
    # Embedded chart placeholders surface as data:image PNG sources when
    # matplotlib renders successfully (otherwise the figure block is omitted
    # and we still render the table).
    assert "Module Execution Summary" in html


@pytest.mark.unit
def test_render_html_falls_back_when_chart_render_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    """Chart rendering failure must NOT abort HTML rendering (T4.2 acceptance)."""

    def _explode(*_args, **_kwargs):  # noqa: ANN001 -- test stub, signature flexible
        raise RuntimeError("synthetic chart failure")

    monkeypatch.setattr(report_service, "render_severity_donut", _explode)
    monkeypatch.setattr(report_service, "render_score_radar", _explode)
    monkeypatch.setattr(report_service, "render_module_duration_bar", _explode)

    html = render_html(_sample_report_data())

    assert "<title>example.com" in html.lower()
    # No data:image embedded when charts fail; the fallback content survives.
    assert "data:image/png;base64," not in html
    assert "Severity Overview" in html


@pytest.mark.unit
def test_render_html_escapes_user_supplied_strings() -> None:
    """Injected scan domain / titles must be HTML-escaped (autoescape on)."""
    payload = _sample_report_data()
    payload["scan"]["domain"] = "<script>bad</script>"
    payload["recommendations"][0]["title"] = "<img src=x onerror=alert(1)>"

    html = render_html(payload)

    assert "<script>bad</script>" not in html
    assert "&lt;script&gt;bad&lt;/script&gt;" in html
    assert "<img src=x" not in html
    assert "&lt;img src=x" in html


@pytest.mark.unit
def test_render_pdf_returns_non_empty_bytes() -> None:
    pdf_bytes = render_pdf(_sample_report_data())

    assert isinstance(pdf_bytes, bytes)
    assert len(pdf_bytes) > 1000
    assert b"%PDF" in pdf_bytes[:8]
    # T3.3: cover page is its own page; body starts on page 2 -> total >= 2.
    assert pdf_bytes.count(b"/Type /Page\n") >= 2 or b"/Count 2" in pdf_bytes
    # T3.2: embedded matplotlib charts produce XObject Image streams in the PDF.
    assert b"/XObject" in pdf_bytes
    assert b"/Subtype /Image" in pdf_bytes


@pytest.mark.unit
def test_render_pdf_falls_back_when_chart_render_fails(monkeypatch: pytest.MonkeyPatch) -> None:
    """Chart rendering failure must NOT abort the PDF (T3.2 acceptance)."""

    def _explode(*_args, **_kwargs):  # noqa: ANN001 -- test stub, signature flexible
        raise RuntimeError("synthetic chart failure")

    monkeypatch.setattr(report_service, "render_severity_donut", _explode)
    monkeypatch.setattr(report_service, "render_score_radar", _explode)
    monkeypatch.setattr(report_service, "render_module_duration_bar", _explode)

    pdf_bytes = render_pdf(_sample_report_data())

    # PDF must still be produced, just without the embedded XObject images.
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 1000
    # Cover page survives because it is pure fpdf shapes/text, not matplotlib.
    assert pdf_bytes.count(b"/Type /Page\n") >= 2 or b"/Count 2" in pdf_bytes


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
def test_security_score_breakdown_dict_returns_camelcase_payload() -> None:
    """Report payload must mirror the GET /scans/{id}/detail camelCase shape.

    Guards against the historical drift where ``dataclasses.asdict`` produced
    snake_case while the live API emitted camelCase.
    """
    breakdown = SecurityScoreResult(
        score=72,
        base_score=71.5,
        confidence=0.8,
        severity_cap_applied=None,
        category_scores={
            "transport": 24.0,
            "http_security": 18.0,
            "threat_intel": 15.0,
            "infrastructure": 9.0,
            "best_practices": 6.0,
        },
    )

    result = _security_score_breakdown_dict(breakdown)

    assert result == {
        "baseScore": 71.5,
        "confidence": 0.8,
        "severityCapApplied": None,
        "categoryScores": {
            "transport": 24.0,
            "httpSecurity": 18.0,
            "threatIntel": 15.0,
            "infrastructure": 9.0,
            "bestPractices": 6.0,
        },
    }


@pytest.mark.unit
def test_security_score_breakdown_dict_returns_none_for_missing_breakdown() -> None:
    assert _security_score_breakdown_dict(None) is None


@pytest.mark.unit
def test_report_breakdown_shape_matches_detail_endpoint() -> None:
    """Snapshot guard: report breakdown keys must equal the detail endpoint keys."""
    detail_breakdown_keys = {"baseScore", "confidence", "severityCapApplied", "categoryScores"}
    detail_category_keys = {
        "transport",
        "httpSecurity",
        "threatIntel",
        "infrastructure",
        "bestPractices",
    }

    breakdown = SecurityScoreResult(
        score=85,
        base_score=85.0,
        confidence=1.0,
        severity_cap_applied=None,
        category_scores={
            "transport": 30.0,
            "http_security": 22.0,
            "threat_intel": 18.0,
            "infrastructure": 10.0,
            "best_practices": 5.0,
        },
    )

    report_breakdown = _security_score_breakdown_dict(breakdown)
    assert report_breakdown is not None
    assert set(report_breakdown.keys()) == detail_breakdown_keys
    assert set(report_breakdown["categoryScores"].keys()) == detail_category_keys


@pytest.mark.unit
def test_sum_module_duration_ms_keeps_zero_value() -> None:
    modules = [
        SimpleNamespace(duration_ms=0),
        SimpleNamespace(duration_ms=None),
    ]

    assert _sum_module_duration_ms(modules) == 0


@pytest.mark.unit
def test_ssl_chain_preview_caps_to_three_entries() -> None:
    """T3.1: SSL chain preview must not exceed SSL_CHAIN_PREVIEW_LIMIT."""
    detail = {
        "ssl": {
            "chainDetails": [
                {"order": i, "subject": f"cert-{i}", "issuer": f"issuer-{i}", "isTrusted": True}
                for i in range(5)
            ]
        }
    }

    preview = _ssl_chain_preview(detail)

    assert [entry["order"] for entry in preview] == [0, 1, 2]


@pytest.mark.unit
def test_ssl_days_remaining_text_handles_expired_and_missing() -> None:
    assert _ssl_days_remaining_text({"ssl": {"daysRemaining": 90}}) == "90 days remaining"
    assert _ssl_days_remaining_text({"ssl": {"daysRemaining": -3}}) == "expired 3 days ago"
    assert _ssl_days_remaining_text({"ssl": {}}) == "N/A"
    assert _ssl_days_remaining_text({}) == "N/A"


@pytest.mark.unit
def test_group_tech_by_category_sorts_alphabetically_and_by_confidence() -> None:
    detail = {
        "techStack": {
            "technologies": [
                {"name": "B-Lib", "category": "Library", "confidence": 50},
                {"name": "A-Lib", "category": "Library", "confidence": 80},
                {"name": "Cloudflare", "category": "CDN", "confidence": 90},
                {"name": "Other", "category": "", "confidence": 10},
            ]
        }
    }

    groups = _group_tech_by_category(detail)

    keys = [pair[0] for pair in groups]
    assert keys == sorted(keys, key=str.lower)
    library = next(items for cat, items in groups if cat == "Library")
    # Highest-confidence tech first (A-Lib 80 > B-Lib 50).
    assert library[0]["name"] == "A-Lib"
    # Items with empty category fall under "Uncategorized".
    assert any(cat == "Uncategorized" for cat, _ in groups)


@pytest.mark.unit
def test_safe_chart_bytes_returns_none_on_exception() -> None:
    def _broken() -> bytes:
        raise RuntimeError("synthetic")

    assert _safe_chart_bytes(_broken) is None


@pytest.mark.unit
def test_safe_chart_bytes_returns_none_when_builder_returns_empty() -> None:
    def _empty() -> bytes:
        return b""

    assert _safe_chart_bytes(_empty) is None


@pytest.mark.unit
def test_safe_chart_bytes_returns_bytes_when_builder_succeeds() -> None:
    def _ok() -> bytes:
        return b"\x89PNG-tiny"

    result = _safe_chart_bytes(_ok)
    assert result == b"\x89PNG-tiny"


@pytest.mark.unit
def test_embed_chart_returns_false_for_missing_bytes() -> None:
    sentinel = object()

    # _embed_chart should short-circuit on falsy bytes without touching the pdf.
    assert _embed_chart(sentinel, None, width_mm=10) is False
    assert _embed_chart(sentinel, b"", width_mm=10) is False
