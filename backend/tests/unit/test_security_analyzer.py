"""Unit tests for security_analyzer service."""

from types import SimpleNamespace

import pytest

from app.models.scan import ModuleStatus, ScanStatus
from app.services.security_analyzer import (
    CATEGORY_WEIGHTS,
    SecurityScoreResult,
    compute_category_summary,
    compute_security_score,
    compute_security_score_v2,
    compute_severity_counts,
    extract_key_findings,
    resolve_security_score_for_detail,
)


def _mods(n_success: int, n_fail: int) -> list[SimpleNamespace]:
    out = [SimpleNamespace(status=ModuleStatus.SUCCESS) for _ in range(n_success)]
    out.extend([SimpleNamespace(status=ModuleStatus.FAILED) for _ in range(n_fail)])
    return out


def _perfect_raw() -> dict:
    return {
        "headers": {
            "content-security-policy": "default-src 'self'",
            "x-frame-options": "DENY",
            "x-content-type-options": "nosniff",
            "referrer-policy": "strict-origin",
            "permissions-policy": "geolocation=()",
        },
        "ssl": {"bits": 256, "valid_to": "Dec 31 23:59:59 2030 GMT"},
        "tls": {
            "connection": {
                "protocols": [
                    {"name": "TLSv1.3", "supported": True},
                    {"name": "TLSv1.2", "supported": True},
                ],
                "ciphers": [{"name": "TLS_AES_256_GCM_SHA384"}],
            },
        },
        "hsts": {"compatible": True, "preload": True, "includeSubDomains": True},
        "redirects": {
            "hops": [
                {"url": "http://example.com"},
                {"url": "https://example.com/"},
            ],
        },
        "cookies": {"clientCookies": []},
        "dnssec": {"enabled": True},
        "firewall": {"hasWaf": True},
        "security-txt": {"isPresent": True},
        "robots-txt": {"robots": [{"User-agent": "*"}]},
        "ports": {"openPorts": [80, 443], "failedPorts": []},
        "threats": {"safeBrowsing": {"unsafe": False}},
        "block-lists": {"blocklists": [{"isBlocked": False}]},
        "mail-config": {
            "spf": {"status": "pass"},
            "dkim": {"found": True},
            "dmarc": {"status": "pass"},
        },
    }


@pytest.mark.unit
def test_compute_security_score_empty_input_returns_zero():
    """Empty raw results yield 0 via legacy wrapper (V2 returns None)."""
    assert compute_security_score({}) == 0


@pytest.mark.unit
def test_compute_security_score_perfect_site_high_band():
    """Well-configured site scores in top band."""
    raw = _perfect_raw()
    assert 95 <= compute_security_score(raw) <= 100


@pytest.mark.unit
def test_v2_empty_input_returns_none():
    assert compute_security_score_v2({}) is None


@pytest.mark.unit
def test_v2_perfect_site_scores_95_to_100():
    r = compute_security_score_v2(_perfect_raw(), _mods(10, 0))
    assert r is not None
    assert r.score >= 95


@pytest.mark.unit
def test_v2_minimal_site_scores_low():
    raw = {"headers": {}}
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.score < 50


@pytest.mark.unit
def test_v2_transport_category_ssl_expired_scores_low():
    raw = _perfect_raw()
    raw["ssl"] = {"bits": 256, "valid_to": "Jan 1 00:00:00 2020 GMT"}
    r = compute_security_score_v2(raw)
    assert r is not None
    baseline = compute_security_score_v2(_perfect_raw())
    assert baseline is not None
    assert r.category_scores["transport"] < baseline.category_scores["transport"] - 20


@pytest.mark.unit
def test_v2_http_security_missing_all_headers():
    raw = {"headers": {}}
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["http_security"] == 0


@pytest.mark.unit
def test_v2_threat_intel_clean_scores_100():
    raw = {
        "threats": {
            "safeBrowsing": {"unsafe": False},
            "urlHaus": {},
            "phishTank": {"in_database": "false"},
        },
        "block-lists": {"blocklists": [{"isBlocked": False}]},
    }
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["threat_intel"] == 100


@pytest.mark.unit
def test_v2_threat_module_missing_gives_full_marks():
    r = compute_security_score_v2({"headers": {"content-security-policy": "x"}})
    assert r is not None
    assert r.category_scores["threat_intel"] == 100


@pytest.mark.unit
def test_v2_infrastructure_dangerous_port_open():
    raw = {"ports": {"openPorts": [21, 443]}}
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["infrastructure"] < 70


@pytest.mark.unit
def test_v2_best_practices_all_email_pass():
    raw = {
        "security-txt": {"isPresent": True},
        "robots-txt": {"robots": [{"x": 1}]},
        "mail-config": {
            "spf": {"status": "pass"},
            "dkim": {"found": True},
            "dmarc": {"status": "pass"},
        },
    }
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["best_practices"] == 100


@pytest.mark.unit
def test_v2_critical_cap_ssl_expired():
    raw = _perfect_raw()
    raw["ssl"] = {"bits": 256, "valid_to": "Jan 1 00:00:00 2020 GMT"}
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.score <= 39
    assert r.severity_cap_applied == "critical"


@pytest.mark.unit
def test_v2_critical_cap_threat_listed():
    raw = _perfect_raw()
    raw["threats"] = {"safeBrowsing": {"unsafe": True}}
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.score <= 39


@pytest.mark.unit
def test_v2_critical_cap_dangerous_port():
    raw = _perfect_raw()
    raw["ports"] = {"openPorts": [23, 443]}
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.score <= 39


@pytest.mark.unit
def test_v2_cdn_proxy_ports_do_not_trigger_critical_cap():
    raw = _perfect_raw()
    raw["ports"] = {
        "openPorts": [23, 443, 445],
        "behindProxy": True,
        "proxyProvider": "Cloudflare",
    }

    r = compute_security_score_v2(raw)

    assert r is not None
    assert r.severity_cap_applied is None
    assert r.score > 39


@pytest.mark.unit
def test_v2_high_cap_missing_csp():
    raw = _perfect_raw()
    del raw["headers"]["content-security-policy"]
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.score <= 69
    assert r.severity_cap_applied == "high"


@pytest.mark.unit
def test_v2_high_cap_legacy_tls():
    raw = _perfect_raw()
    raw["tls"] = {
        "connection": {
            "protocols": [{"name": "TLSv1.0", "supported": True}],
            "ciphers": [],
        },
    }
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.score <= 69
    assert r.severity_cap_applied == "high"


@pytest.mark.unit
def test_v2_no_cap_clean_site():
    r = compute_security_score_v2(_perfect_raw())
    assert r is not None
    assert r.score > 69
    assert r.severity_cap_applied is None


@pytest.mark.unit
def test_v2_confidence_full_no_penalty():
    r = compute_security_score_v2(_perfect_raw(), _mods(5, 0))
    assert r is not None
    assert r.score == round(r.base_score)


@pytest.mark.unit
def test_v2_confidence_80pct_no_penalty():
    mods = _mods(8, 2)
    r = compute_security_score_v2(_perfect_raw(), mods)
    assert r is not None
    assert r.confidence == 0.8
    assert r.score == round(r.base_score)


@pytest.mark.unit
def test_v2_confidence_50pct_mild_penalty():
    mods = _mods(5, 5)
    r = compute_security_score_v2(_perfect_raw(), mods)
    assert r is not None
    assert r.confidence == 0.5
    assert r.score < round(r.base_score)


@pytest.mark.unit
def test_v2_confidence_20pct_strong_penalty():
    mods = _mods(2, 8)
    r = compute_security_score_v2(_perfect_raw(), mods)
    assert r is not None
    assert r.confidence == 0.2
    low = compute_security_score_v2(_perfect_raw(), _mods(10, 0))
    assert low is not None
    assert r.score < low.score


@pytest.mark.unit
def test_v2_confidence_zero_returns_zero():
    mods = [SimpleNamespace(status=ModuleStatus.FAILED) for _ in range(3)]
    r = compute_security_score_v2(_perfect_raw(), mods)
    assert r is not None
    assert r.score == 0


@pytest.mark.unit
def test_v2_hsts_not_double_counted():
    """HSTS failure costs at most transport HSTS points; HTTP headers still full."""
    raw = _perfect_raw()
    raw["hsts"] = {"compatible": False}
    # No STS header in headers dict — HSTS scored only in transport
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["http_security"] == 100
    assert r.severity_cap_applied == "high"
    assert r.score <= 69


@pytest.mark.unit
def test_old_compute_security_score_still_works():
    assert 95 <= compute_security_score(_perfect_raw()) <= 100


@pytest.mark.unit
def test_old_compute_security_score_empty_returns_zero():
    assert compute_security_score({}) == 0


@pytest.mark.unit
def test_v2_cookie_all_secure():
    raw = {
        "headers": {
            "content-security-policy": "x",
            "x-frame-options": "x",
            "x-content-type-options": "nosniff",
            "referrer-policy": "x",
            "permissions-policy": "x",
        },
        "cookies": {
            "clientCookies": [
                {
                    "name": "a",
                    "secure": True,
                    "httpOnly": True,
                    "sameSite": "Strict",
                },
            ],
        },
    }
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["http_security"] == 100


@pytest.mark.unit
def test_v2_cookie_none_secure():
    raw = {
        "headers": {
            "content-security-policy": "x",
            "x-frame-options": "x",
            "x-content-type-options": "nosniff",
            "referrer-policy": "x",
            "permissions-policy": "x",
        },
        "cookies": {
            "clientCookies": [
                {"name": "a", "secure": False, "httpOnly": False, "sameSite": "none"},
            ],
        },
    }
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["http_security"] == 80


@pytest.mark.unit
def test_v2_no_cookies_full_marks():
    raw = {
        "headers": {
            "content-security-policy": "x",
            "x-frame-options": "x",
            "x-content-type-options": "nosniff",
            "referrer-policy": "x",
            "permissions-policy": "x",
        },
        "cookies": {"clientCookies": []},
    }
    r = compute_security_score_v2(raw)
    assert r is not None
    assert r.category_scores["http_security"] == 100


@pytest.mark.unit
def test_v2_result_has_all_fields():
    r = compute_security_score_v2(_perfect_raw())
    assert r is not None
    assert isinstance(r.score, int)
    assert isinstance(r.base_score, float)
    assert isinstance(r.confidence, float)
    assert r.severity_cap_applied is None or r.severity_cap_applied in ("critical", "high")
    for k in CATEGORY_WEIGHTS:
        assert k in r.category_scores


@pytest.mark.unit
def test_compute_security_score_risky_infra_port_reduces_score():
    """Port 3306 is risky (not critical cap) but lowers infra category."""
    raw = {
        "headers": {"content-security-policy": "x"},
        "ssl": {"bits": 256, "valid_to": "Dec 31 2030 GMT"},
        "ports": {"openPorts": [443, 3306]},
    }
    score = compute_security_score(raw)
    assert score < 100


@pytest.mark.unit
def test_compute_security_score_clamped_to_0_100():
    raw = {
        "headers": {},
        "ssl": {"bits": 64, "valid_to": "Jan 1 2020"},
        "hsts": {"compatible": False},
        "dnssec": {"enabled": False},
        "firewall": {"hasWaf": False},
        "security-txt": {"isPresent": False},
        "ports": {"openPorts": [21, 23, 445, 3389]},
        "threats": {"safeBrowsing": {"unsafe": True}},
    }
    score = compute_security_score(raw)
    assert 0 <= score <= 100


@pytest.mark.unit
def test_compute_severity_counts_empty_returns_zeros():
    assert compute_severity_counts({}) == {
        "critical": 0,
        "high": 0,
        "medium": 0,
        "low": 0,
    }


@pytest.mark.unit
def test_compute_severity_counts_perfect_site_zeros():
    raw = {
        "headers": {
            "content-security-policy": "x",
            "x-frame-options": "x",
            "x-content-type-options": "nosniff",
            "referrer-policy": "x",
            "permissions-policy": "x",
        },
        "ssl": {"bits": 256, "valid_to": "Dec 31 2030 GMT"},
        "hsts": {"compatible": True},
        "dnssec": {"enabled": True},
        "security-txt": {"isPresent": True},
        "robots-txt": {"robots": [{}]},
    }
    counts = compute_severity_counts(raw)
    assert counts["critical"] == 0
    assert counts["high"] == 0


@pytest.mark.unit
def test_compute_severity_counts_ssl_expired_critical():
    raw = {"ssl": {"bits": 256, "valid_to": "Jan 1 00:00:00 2020 GMT"}}
    counts = compute_severity_counts(raw)
    assert counts["critical"] >= 1


@pytest.mark.unit
def test_compute_severity_counts_threats_critical():
    raw = {"threats": {"safeBrowsing": {"unsafe": True}}}
    counts = compute_severity_counts(raw)
    assert counts["critical"] >= 1


@pytest.mark.unit
def test_compute_severity_counts_missing_csp_high():
    raw = {"headers": {"x-frame-options": "x"}}
    counts = compute_severity_counts(raw)
    assert counts["high"] >= 1


@pytest.mark.unit
def test_compute_category_summary_returns_three_categories():
    result = compute_category_summary({})
    assert len(result) == 3
    labels = {c["label"] for c in result}
    assert labels == {"Security", "Network", "Content"}
    for cat in result:
        assert "category" in cat
        assert "label" in cat
        assert "modulesChecked" in cat
        assert "issuesFound" in cat
        assert "status" in cat
        assert cat["status"] in ("pass", "warn", "fail")


@pytest.mark.unit
def test_compute_category_summary_pass_when_no_issues():
    raw = {
        "headers": {
            "content-security-policy": "x",
            "x-frame-options": "x",
            "x-content-type-options": "nosniff",
            "referrer-policy": "x",
            "permissions-policy": "x",
        },
        "ssl": {"bits": 256, "valid_to": "Dec 31 2030"},
        "hsts": {"compatible": True},
        "tls": {"connection": {"protocols": [], "ciphers": []}},
        "dnssec": {"enabled": True},
        "firewall": {"hasWaf": True},
        "security-txt": {"isPresent": True},
        "robots-txt": {"robots": [{}]},
        "sitemap": {"urlset": {"url": ["x"]}},
        "cookies": {"clientCookies": []},
    }
    result = compute_category_summary(raw)
    for cat in result:
        if cat["issuesFound"] == 0:
            assert cat["status"] == "pass"


@pytest.mark.unit
def test_extract_key_findings_empty_input():
    assert extract_key_findings({}) == []
    assert extract_key_findings({}, max_findings=5) == []


@pytest.mark.unit
def test_extract_key_findings_sorted_by_severity():
    raw = {
        "headers": {},
        "ssl": {"bits": 64, "valid_to": "Jan 1 2020 GMT"},
        "hsts": {"compatible": False},
        "ports": {"openPorts": [21, 443]},
        "security-txt": {"isPresent": False},
    }
    findings = extract_key_findings(raw, max_findings=20)
    severities = [f["severity"] for f in findings]
    order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    for i in range(len(severities) - 1):
        assert order.get(severities[i], 4) <= order.get(severities[i + 1], 4)


@pytest.mark.unit
def test_extract_key_findings_respects_max_findings():
    raw = {
        "headers": {},
        "ssl": {"bits": 64, "valid_to": "Jan 1 2020 GMT"},
        "hsts": {"compatible": False},
        "security-txt": {"isPresent": False},
        "firewall": {"hasWaf": False},
    }
    findings = extract_key_findings(raw, max_findings=3)
    assert len(findings) <= 3


@pytest.mark.unit
def test_extract_key_findings_replaces_dangerous_port_with_proxy_notice():
    raw = {
        "ports": {
            "openPorts": [23, 443],
            "behindProxy": True,
            "proxyProvider": "Cloudflare",
        },
    }

    findings = extract_key_findings(raw, max_findings=20)

    assert any("behind CDN/proxy (Cloudflare)" in item["description"] for item in findings)
    assert all(item["title"] != "Dangerous ports open" for item in findings)


@pytest.mark.unit
def test_resolve_risk_score_stored_score_wins():
    assert (
        resolve_security_score_for_detail(
            stored_score=55,
            scan_status=ScanStatus.COMPLETED,
            module_results=[],
            all_raw={},
        ).score
        == 55
    )


@pytest.mark.unit
def test_resolve_risk_score_pending_running_returns_none():
    mod = SimpleNamespace(status=ModuleStatus.SUCCESS)
    for st in (ScanStatus.PENDING, ScanStatus.RUNNING):
        assert (
            resolve_security_score_for_detail(
                stored_score=None,
                scan_status=st,
                module_results=[mod],
                all_raw={"ports": {"openPorts": [443]}},
            ).score
            is None
        )


@pytest.mark.unit
def test_resolve_risk_score_completed_derives_when_stored_null():
    perfect_raw = _perfect_raw()
    mod = SimpleNamespace(status=ModuleStatus.SUCCESS)
    resolved = resolve_security_score_for_detail(
        stored_score=None,
        scan_status=ScanStatus.COMPLETED,
        module_results=[mod],
        all_raw=perfect_raw,
    )
    assert resolved.score is not None
    assert 95 <= resolved.score <= 100
    assert resolved.breakdown is not None
    assert isinstance(resolved.breakdown, SecurityScoreResult)


@pytest.mark.unit
def test_resolve_risk_score_failed_no_success_returns_zero():
    assert (
        resolve_security_score_for_detail(
            stored_score=None,
            scan_status=ScanStatus.FAILED,
            module_results=[SimpleNamespace(status=ModuleStatus.FAILED)],
            all_raw={},
        ).score
        == 0
    )


@pytest.mark.unit
def test_resolve_risk_score_cancelled_no_success_returns_none():
    assert (
        resolve_security_score_for_detail(
            stored_score=None,
            scan_status=ScanStatus.CANCELLED,
            module_results=[SimpleNamespace(status=ModuleStatus.FAILED)],
            all_raw={},
        ).score
        is None
    )


@pytest.mark.unit
def test_resolve_risk_score_cancelled_partial_success_derives():
    mod = SimpleNamespace(status=ModuleStatus.SUCCESS)
    resolved = resolve_security_score_for_detail(
        stored_score=None,
        scan_status=ScanStatus.CANCELLED,
        module_results=[mod],
        all_raw={"ports": {"openPorts": [443]}},
    )
    assert resolved.score is not None
    assert 0 <= resolved.score <= 100


@pytest.mark.unit
def test_resolve_risk_score_from_incomplete_run_matches_task_semantics():
    mod_ok = SimpleNamespace(status=ModuleStatus.SUCCESS)
    assert (
        resolve_security_score_for_detail(
            stored_score=None,
            scan_status=ScanStatus.RUNNING,
            module_results=[mod_ok],
            all_raw={"ports": {"openPorts": [443]}},
            from_incomplete_run=True,
        ).score
        is not None
    )
    assert (
        resolve_security_score_for_detail(
            stored_score=None,
            scan_status=ScanStatus.RUNNING,
            module_results=[SimpleNamespace(status=ModuleStatus.FAILED)],
            all_raw={},
            from_incomplete_run=True,
        ).score
        == 0
    )


@pytest.mark.unit
def test_extract_key_findings_each_has_required_fields():
    raw = {
        "ssl": {"bits": 64, "valid_to": "Jan 1 2020 GMT"},
        "hsts": {"compatible": False},
    }
    findings = extract_key_findings(raw)
    for f in findings:
        assert "id" in f
        assert "title" in f
        assert "description" in f
        assert "severity" in f
        assert "module" in f
