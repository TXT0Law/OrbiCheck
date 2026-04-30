"""Unit tests for the shared scan recommendations generator.

Covers each rule branch + the fallback behaviour so the live scan detail
endpoint and the offline report renderer share the same actionable advice.
"""

from __future__ import annotations

import pytest

from app.services.recommendations import (
    HEADER_PREVIEW_LIMIT,
    MAX_RECOMMENDATIONS,
    SEVERITY_ORDER,
    generate_recommendations,
)


def _ssl_detail(days_remaining: int | None) -> dict:
    """Build a minimal scan_detail with only the SSL block populated."""
    return {
        "ssl": {} if days_remaining is None else {"daysRemaining": days_remaining},
        "headers": {"securityChecks": []},
        "ports": {"entries": []},
        "dnssec": {"enabled": True},
    }


@pytest.mark.unit
def test_generate_recommendations_flags_expired_ssl() -> None:
    detail = _ssl_detail(-3)

    items = generate_recommendations(detail, [])

    assert any(item["title"] == "Replace expired SSL certificate" for item in items)
    severities = {item["severity"] for item in items if "SSL" in item["title"]}
    assert severities == {"critical"}


@pytest.mark.unit
def test_generate_recommendations_flags_expiring_soon_ssl() -> None:
    detail = _ssl_detail(15)

    items = generate_recommendations(detail, [])

    assert any(item["title"] == "Renew SSL certificate soon" for item in items)


@pytest.mark.unit
def test_generate_recommendations_skips_ssl_when_healthy() -> None:
    detail = _ssl_detail(180)

    items = generate_recommendations(detail, [])

    assert not any("SSL" in item["title"] for item in items)


@pytest.mark.unit
def test_generate_recommendations_warns_on_missing_headers() -> None:
    detail = {
        "ssl": {"daysRemaining": 365},
        "headers": {
            "securityChecks": [
                {"name": "Content-Security-Policy", "status": "missing"},
                {"name": "X-Frame-Options", "status": "fail"},
                {"name": "X-Content-Type-Options", "status": "pass"},
            ]
        },
        "ports": {"entries": []},
        "dnssec": {"enabled": True},
    }

    items = generate_recommendations(detail, [])

    header_item = next(item for item in items if item["title"] == "Harden HTTP response headers")
    assert "Content-Security-Policy" in header_item["description"]
    assert "X-Frame-Options" in header_item["description"]
    assert "X-Content-Type-Options" not in header_item["description"]


@pytest.mark.unit
def test_generate_recommendations_truncates_header_preview() -> None:
    detail = {
        "ssl": {"daysRemaining": 365},
        "headers": {
            "securityChecks": [
                {"name": f"Header-{idx}", "status": "missing"}
                for idx in range(HEADER_PREVIEW_LIMIT + 3)
            ]
        },
        "ports": {"entries": []},
        "dnssec": {"enabled": True},
    }

    items = generate_recommendations(detail, [])

    header_item = next(item for item in items if item["title"] == "Harden HTTP response headers")
    assert header_item["description"].count("Header-") == HEADER_PREVIEW_LIMIT


@pytest.mark.unit
def test_generate_recommendations_flags_dangerous_ports() -> None:
    detail = {
        "ssl": {"daysRemaining": 365},
        "headers": {"securityChecks": []},
        "ports": {"entries": [{"port": 21}, {"port": 443}, {"port": 3389}]},
        "dnssec": {"enabled": True},
    }

    items = generate_recommendations(detail, [])

    port_item = next(item for item in items if item["title"] == "Restrict dangerous public ports")
    assert port_item["severity"] == "critical"
    assert "21" in port_item["description"]
    assert "3389" in port_item["description"]
    assert "443" not in port_item["description"]


@pytest.mark.unit
def test_generate_recommendations_flags_dnssec_disabled() -> None:
    detail = {
        "ssl": {"daysRemaining": 365},
        "headers": {"securityChecks": []},
        "ports": {"entries": []},
        "dnssec": {"enabled": False},
    }

    items = generate_recommendations(detail, [])

    assert any(item["title"] == "Enable DNSSEC validation" for item in items)


@pytest.mark.unit
def test_generate_recommendations_falls_back_to_top_findings() -> None:
    detail = {
        "ssl": {"daysRemaining": 365},
        "headers": {"securityChecks": []},
        "ports": {"entries": []},
        "dnssec": {"enabled": True},
    }
    findings = [
        {"severity": "high", "title": "Missing CSP", "description": "CSP not set."},
        {"severity": "medium", "title": "Weak ciphers", "description": "Replace ciphers."},
        {"severity": "low", "title": "No security.txt", "description": "Publish security.txt."},
        {"severity": "low", "title": "Unused", "description": "Dropped from fallback."},
    ]

    items = generate_recommendations(detail, findings)

    assert [item["title"] for item in items] == [
        "Missing CSP",
        "Weak ciphers",
        "No security.txt",
    ]


@pytest.mark.unit
def test_generate_recommendations_fallback_returns_empty_when_no_findings() -> None:
    detail = {
        "ssl": {"daysRemaining": 365},
        "headers": {"securityChecks": []},
        "ports": {"entries": []},
        "dnssec": {"enabled": True},
    }

    items = generate_recommendations(detail, [])

    assert items == []


@pytest.mark.unit
def test_generate_recommendations_sorts_by_severity() -> None:
    detail = {
        "ssl": {"daysRemaining": 15},
        "headers": {
            "securityChecks": [{"name": "Content-Security-Policy", "status": "missing"}]
        },
        "ports": {"entries": [{"port": 21}]},
        "dnssec": {"enabled": False},
    }

    items = generate_recommendations(detail, [])

    severities = [item["severity"] for item in items]
    assert severities == sorted(severities, key=lambda s: SEVERITY_ORDER[s])
    assert severities[0] == "critical"


@pytest.mark.unit
def test_generate_recommendations_caps_to_max_size() -> None:
    detail = {
        "ssl": {"daysRemaining": 15},
        "headers": {
            "securityChecks": [{"name": "Content-Security-Policy", "status": "missing"}]
        },
        "ports": {"entries": [{"port": 21}]},
        "dnssec": {"enabled": False},
    }
    findings = [
        {"severity": "low", "title": f"finding-{i}", "description": f"desc-{i}"}
        for i in range(10)
    ]

    items = generate_recommendations(detail, findings)

    assert len(items) <= MAX_RECOMMENDATIONS


@pytest.mark.unit
def test_generate_recommendations_handles_legacy_ports_list_shape() -> None:
    """Backward-compat: ports may be a bare list (legacy transformer shape)."""
    detail = {
        "ssl": {"daysRemaining": 365},
        "headers": {"securityChecks": []},
        "ports": [{"port": 23}],
        "dnssec": {"enabled": True},
    }

    items = generate_recommendations(detail, [])

    assert any(item["title"] == "Restrict dangerous public ports" for item in items)
