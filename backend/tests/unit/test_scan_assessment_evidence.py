"""Regression cases for the actual shapes emitted by partial scans."""

from types import SimpleNamespace

import pytest

from app.models.scan import ModuleStatus
from app.services.security_analyzer import (
    compute_category_summary,
    compute_confidence,
    compute_security_score_v2,
    compute_severity_counts,
    extract_key_findings,
)

pytestmark = pytest.mark.unit


def test_only_observed_headers_can_raise_findings():
    raw = {
        "status": {"responseCode": 200, "isUp": True},
        "headers": {"responseHeaders": {
            "strict-transport-security": "max-age=31536000; includeSubDomains",
            "content-security-policy": "default-src 'self'",
            "x-frame-options": "DENY",
            "referrer-policy": "strict-origin",
            "x-content-type-options": "nosniff",
        }},
        "dnssec": {"skipped": True},
        "ssl": {"error": "connect timeout"},
    }

    assert [f["title"] for f in extract_key_findings(raw)] == ["Missing Permissions-Policy"]
    assert compute_severity_counts(raw) == {"critical": 0, "high": 0, "medium": 0, "low": 1}
    security = next(c for c in compute_category_summary(raw) if c["category"] == "security")
    assert (security["modulesChecked"], security["issuesFound"]) == (1, 1)
    assert compute_security_score_v2(raw).severity_cap_applied is None


def test_partial_http_security_flags_only_prove_measured_fields():
    raw = {"http-security": {"contentSecurityPolicy": True, "xFrameOptions": False}}
    assert [f["title"] for f in extract_key_findings(raw)] == ["Missing X-Frame-Options"]


@pytest.mark.parametrize("ssl", [{"issuer": "CA"}, {"bits": "unknown"}, {"bits": None}])
def test_partial_certificate_does_not_prove_weak_key(ssl):
    raw = {"ssl": ssl}
    assert extract_key_findings(raw) == []
    assert sum(compute_severity_counts(raw).values()) == 0
    assert sum(c["issuesFound"] for c in compute_category_summary(raw)) == 0
    assert compute_security_score_v2(raw).severity_cap_applied is None


def test_explicit_negative_measurements_still_raise_findings():
    raw = {
        "hsts": {"enabled": False},
        "ssl": {"bits": "32"},
        "dnssec": {"enabled": False},
        "http-security": {"contentSecurityPolicy": False},
    }
    assert {f["title"] for f in extract_key_findings(raw)} == {
        "HSTS not enabled", "Weak SSL grade", "DNSSEC not enabled", "Missing Content-Security-Policy",
    }


def test_legacy_skipped_success_is_not_a_completed_observation():
    rows = [
        SimpleNamespace(status=ModuleStatus.SUCCESS, raw_result={"isUp": True}),
        SimpleNamespace(status=ModuleStatus.SUCCESS, raw_result={"skipped": True}),
    ]
    assert compute_confidence(rows) == 0.5


def test_legacy_success_with_failed_or_empty_payload_does_not_raise_confidence():
    rows = [
        SimpleNamespace(module_name="headers", status=ModuleStatus.SUCCESS, raw_result={}),
        SimpleNamespace(module_name="ssl", status=ModuleStatus.SUCCESS, raw_result={"error": "timeout"}),
        SimpleNamespace(module_name="status", status=ModuleStatus.SUCCESS, raw_result={"isUp": True}),
    ]
    assert compute_confidence(rows) == pytest.approx(1 / 3)


def test_category_without_any_measured_module_is_unknown():
    categories = compute_category_summary({"ports": {"skipped": True}})
    assert all(c["modulesChecked"] == 0 and c["status"] == "unknown" for c in categories)
