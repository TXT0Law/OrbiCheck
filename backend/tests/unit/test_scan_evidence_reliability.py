"""Regression coverage for scans with execution but little observed evidence."""
from types import SimpleNamespace

import pytest

from app.services.scan_evidence import collect_scan_evidence, observed_dnssec, observed_hsts
from app.services.recommendations import generate_recommendations
from app.services.transformers import build_scan_detail

pytestmark = pytest.mark.unit


def test_status_headers_only_scan_does_not_invent_security_failures() -> None:
    raw = {
        "status": {"responseCode": 200, "responseTime": 12},
        "headers": {"strict-transport-security": "max-age=31536000; includeSubDomains"},
        "ssl": {"skipped": True, "note": "disabled"},
        "dnssec": {"skipped": True},
        "hsts": {"skipped": True},
    }
    detail = build_scan_detail("scan", "https://example.com", raw)
    assert detail["ssl"] is None
    assert detail["dnssec"] is None
    assert detail["hsts"]["enabled"] is True
    assert detail["hsts"]["rawHeader"] == raw["headers"]["strict-transport-security"]
    titles = [item["title"] for item in generate_recommendations(detail, [])]
    assert "Renew SSL certificate soon" not in titles
    assert "Enable DNSSEC validation" not in titles


@pytest.mark.parametrize("raw", [{}, {"error": "timeout"}, {"success": False}, {"skipped": True}, [], "bad"])
def test_unobserved_security_modules_remain_unknown(raw: object) -> None:
    detail = build_scan_detail("scan", "https://example.com", {"ssl": raw, "hsts": raw, "dnssec": raw})
    assert detail["ssl"] is None
    assert detail["hsts"] is None
    assert detail["dnssec"] is None


def test_header_wrapper_is_observed_as_headers() -> None:
    detail = build_scan_detail("scan", "https://example.com", {"headers": {"responseHeaders": {"Strict-Transport-Security": "max-age=123"}}})
    assert detail["hsts"]["enabled"] is True
    checks = {item["name"]: item for item in detail["headers"]["securityChecks"]}
    assert checks["strict-transport-security"]["status"] == "pass"


def test_observed_negative_dnssec_retains_recommendation() -> None:
    detail = build_scan_detail("scan", "https://example.com", {"dnssec": {"enabled": False}})
    assert detail["dnssec"]["enabled"] is False
    assert any(item["title"] == "Enable DNSSEC validation" for item in generate_recommendations(detail, []))


def test_unknown_dnssec_does_not_generate_recommendation() -> None:
    assert generate_recommendations({}, []) == []


@pytest.mark.parametrize("status", ["failed", "timeout", "retrying", "pending", "running"])
def test_unsuccessful_rows_cannot_supply_stale_evidence(status: str) -> None:
    rows = [SimpleNamespace(module_name="hsts", status=status, raw_result={"enabled": False})]
    assert collect_scan_evidence(rows) == {}


@pytest.mark.parametrize("raw", [{"data": {"skipped": True}}, {"skipped": True}, {"error": "failure"}, {}, {"success": False}, {"success": "false"}, {"success": True, "statusCode": 500, "data": {"enabled": False}}])
def test_success_envelope_does_not_guarantee_evidence(raw: dict) -> None:
    rows = [SimpleNamespace(module_name="hsts", status="success", raw_result=raw)]
    assert collect_scan_evidence(rows) == {}


def test_dnssec_nested_records_distinguish_absence_and_failure() -> None:
    negative = {name: {"isFound": False, "response": {"Status": 0}} for name in ("DNSKEY", "DS", "RRSIG")}
    assert observed_dnssec(negative) is False
    negative["DS"] = {"isFound": False, "response": {"Status": 2}}
    assert observed_dnssec(negative) is None
    negative["DNSKEY"] = {"isFound": True, "response": {"Status": 0}}
    assert observed_dnssec(negative) is True


def test_negative_preload_compatibility_does_not_prove_hsts_disabled() -> None:
    assert observed_hsts({"hsts": {"compatible": False}}) is None
    assert observed_hsts({"hsts": {"enabled": False}}) == {"enabled": False}


def test_retry_envelope_preserves_successful_observation() -> None:
    rows = [SimpleNamespace(module_name="hsts", status="success", raw_result={"success": True, "data": {"enabled": True}, "statusCode": 200})]
    assert collect_scan_evidence(rows) == {"hsts": {"enabled": True}}


def test_partial_certificate_does_not_invent_expiry_grade_or_hsts() -> None:
    detail = build_scan_detail("scan", "https://example.com", {"ssl": {"subject": {"CN": "example.com"}}})
    assert detail["ssl"]["grade"] is None
    assert detail["ssl"]["daysRemaining"] is None
    assert detail["ssl"]["hsts"] is None
    assert generate_recommendations(detail, []) == []


def test_invalid_certificate_expiry_is_unknown() -> None:
    detail = build_scan_detail("scan", "https://example.com", {"ssl": {"bits": 256, "valid_to": "invalid"}})
    assert detail["ssl"]["daysRemaining"] is None
    assert generate_recommendations(detail, []) == []


def test_negative_observation_note_is_not_a_configuration_skip() -> None:
    raw = {"hsts": {"enabled": False, "note": "HSTS disabled"}}
    detail = build_scan_detail("scan", "https://example.com", raw)
    assert detail["hsts"]["enabled"] is False


def test_certificate_iso_milliseconds_preserves_observed_validity() -> None:
    detail = build_scan_detail("scan", "https://example.com", {"ssl": {"bits": 256, "valid_to": "2099-03-12T23:59:59.000Z"}})
    assert detail["ssl"]["daysRemaining"] > 0
    assert generate_recommendations(detail, []) == []


@pytest.mark.parametrize(("header", "enabled", "max_age"), [
    ('max-age = "123"; includeSubDomains', True, 123),
    ('x-max-age=123', False, 0),
    ('max-age=123oops', False, 0),
])
def test_hsts_header_parser_respects_directives(header: str, enabled: bool, max_age: int) -> None:
    detail = build_scan_detail("scan", "https://example.com", {"headers": {"strict-transport-security": header}})
    assert detail["hsts"]["enabled"] is enabled
    assert detail["hsts"]["maxAge"] == max_age


@pytest.mark.parametrize("raw", [{"enabled": True, "hstsHeader": []}, {"maxAge": "bad"}, {"maxAge": float("inf")}])
def test_malformed_hsts_fields_do_not_break_detail(raw: dict) -> None:
    detail = build_scan_detail("scan", "https://example.com", {"hsts": raw})
    assert detail["hsts"] is None or isinstance(detail["hsts"]["maxAge"], int)


def test_real_headers_named_like_metadata_remain_observed() -> None:
    headers = {"server": "nginx", "error": "none", "success": "false", "note": "disabled", "strict-transport-security": "max-age=123"}
    detail = build_scan_detail("scan", "https://example.com", {"headers": headers})
    assert detail["headers"]["responseHeaders"] == headers
    assert detail["hsts"]["enabled"] is True


def test_dnssec_cname_answer_alone_does_not_prove_signed_zone() -> None:
    raw = {name: {"isFound": True, "answer": [{"type": 5, "data": "example.com"}]} for name in ("DS", "DNSKEY", "RRSIG")}
    assert observed_dnssec(raw) is None
    raw["DNSKEY"]["answer"] = [{"type": 48, "data": "observed-key"}]
    assert observed_dnssec(raw) is True


def test_unrecognized_tls_grade_is_not_a_failed_grade() -> None:
    detail = build_scan_detail("scan", "https://example.com", {"tls": {"grade": "unknown"}})
    assert detail["ssl"]["grade"] is None
    assert detail["ssl"]["daysRemaining"] is None


@pytest.mark.parametrize("payload", [
    {"success": False, "error": "timeout", "responseHeaders": {"server": "nginx"}},
    {"statusCode": 500, "responseHeaders": {"server": "nginx"}},
    {"skipped": True, "responseHeaders": {"server": "nginx"}},
    {"success": True, "data": {"statusCode": 500, "responseHeaders": {"server": "nginx"}}},
    {"success": True, "data": {"success": "false", "responseHeaders": {"server": "nginx"}}},
])
def test_failed_header_wrappers_never_establish_header_absence(payload: dict) -> None:
    detail = build_scan_detail("scan", "https://example.com", {"headers": payload})
    assert detail["headers"] is None
    assert detail["hsts"] is None


@pytest.mark.parametrize("payload", [
    {"success": True, "data": {"server": "nginx", "error": "none", "note": "disabled"}},
    {"responseHeaders": {"server": "nginx", "error": "none", "note": "disabled"}},
    {"success": True, "data": {"success": True, "data": {"server": "nginx", "error": "none"}}},
])
def test_successful_header_wrappers_preserve_actual_header_names(payload: dict) -> None:
    detail = build_scan_detail("scan", "https://example.com", {"headers": payload})
    assert detail["headers"]["responseHeaders"]["error"] == "none"
    assert detail["hsts"]["enabled"] is False
