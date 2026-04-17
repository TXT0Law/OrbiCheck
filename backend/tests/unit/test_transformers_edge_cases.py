from __future__ import annotations

from collections.abc import Callable
from typing import Any

import pytest

from app.services.transformers import (
    transform_archives,
    transform_associated_hosts,
    transform_cookies,
    transform_dns,
    transform_dnssec,
    transform_email_config,
    transform_features,
    transform_firewall,
    transform_headers,
    transform_hsts,
    transform_ip,
    transform_linked_pages,
    transform_page_source,
    transform_ports,
    transform_quality,
    transform_ranking_and_carbon,
    transform_redirects,
    transform_robots_txt,
    transform_security_txt,
    transform_sitemap,
    transform_social_tags,
    transform_screenshot,
    transform_ssl,
    transform_status,
    transform_tech_stack,
    transform_threats,
    transform_tls,
    transform_traceroute,
    transform_whois,
)


TransformFn = Callable[[dict[str, Any]], Any]


@pytest.mark.unit
@pytest.mark.parametrize(
    ("transformer", "expected_keys"),
    [
        (transform_ssl, {"grade", "issuer", "subject"}),
        (transform_headers, {"overallGrade", "responseHeaders", "securityChecks"}),
        (transform_status, {"httpStatusCode", "responseTimeMs", "redirectCount"}),
        (transform_dns, {"a", "mx", "txt"}),
        (transform_ip, {"ip", "country", "hostingProvider"}),
        (transform_quality, {"categories", "audits", "runtimeError"}),
        (transform_whois, {"registrar", "createdAt", "nameservers"}),
        (transform_hsts, {"enabled", "preloadReady", "maxAge", "rawHeader"}),
        (transform_cookies, {"cookies", "issuesCount"}),
        (transform_firewall, {"detected", "provider", "confidence"}),
        (transform_threats, {"entries", "listedCount"}),
        (transform_tls, {"grade", "protocols", "cipherSuites"}),
        (transform_redirects, {"hops", "totalRedirects", "finalUrl"}),
        (transform_email_config, {"mxRecords", "spf", "dkim", "dmarc"}),
        (transform_robots_txt, {"exists", "rawContent", "disallowedPaths"}),
        (transform_sitemap, {"exists", "url", "urlCount", "sampleUrls"}),
        (transform_dnssec, {"enabled", "valid", "dsRecords"}),
        (transform_security_txt, {"exists", "url", "contact"}),
        (transform_traceroute, {"hops", "totalHops", "destinationReached"}),
        (transform_linked_pages, {"internal", "external", "totalInternal"}),
        (transform_social_tags, {"ogTitle", "twitterCard", "ogImage"}),
        (transform_archives, {"totalSnapshots", "oldestSnapshot", "snapshots"}),
        (transform_features, {"features", "totalDetected", "source"}),
        (transform_associated_hosts, {"domain", "hosts", "totalFound"}),
        (transform_screenshot, {"imageUrl", "viewport", "unavailableReason"}),
        (transform_page_source, {"html", "statusCode", "contentLength"}),
    ],
)
def test_transformers_handle_empty_dict_shapes(
    transformer: TransformFn,
    expected_keys: set[str],
) -> None:
    result = transformer({})

    assert isinstance(result, dict)
    assert expected_keys.issubset(result.keys())


@pytest.mark.unit
@pytest.mark.parametrize(
    ("transformer", "payload", "expected_keys"),
    [
        (transform_ssl, {"key": None}, {"grade", "daysRemaining"}),
        (transform_headers, {"partial": "data"}, {"overallGrade", "securityChecks"}),
        (transform_status, {"responseCode": None}, {"httpStatusCode", "responseTimeMs"}),
        (transform_dns, {"TXT": None}, {"txt", "mx"}),
        (transform_ip, {"ip": None}, {"ip", "isp"}),
        (transform_quality, {"success": False, "error": "failed"}, {"categories", "runtimeError"}),
        (transform_whois, {"partial": "data"}, {"registrar", "domainStatus"}),
        (transform_hsts, {"hstsHeader": None}, {"enabled", "preloadReady", "preload"}),
        (transform_cookies, {"key": None}, {"cookies", "issuesCount"}),
        (transform_firewall, {"hasWaf": None}, {"detected", "confidence"}),
        (transform_threats, {"safeBrowsing": None}, {"entries", "listedCount"}),
        (transform_tls, {"key": None}, {"grade", "cipherStats"}),
        (transform_redirects, {"redirects": None}, {"hops", "finalUrl"}),
        (transform_email_config, {"key": None}, {"mxRecords", "spf"}),
        (transform_robots_txt, {"content": None}, {"exists", "sitemapUrls"}),
        (transform_sitemap, {"entries": []}, {"exists", "sampleUrls"}),
        (transform_dnssec, {"enabled": None}, {"enabled", "algorithm"}),
        (transform_security_txt, {"fields": {"Contact": None}}, {"contact", "exists"}),
        (transform_traceroute, {"result": None}, {"hops", "destinationReached"}),
        (transform_linked_pages, {"internal": [], "external": []}, {"internal", "external"}),
        (transform_social_tags, {"title": None}, {"ogTitle", "twitterTitle"}),
        (transform_archives, {"results": []}, {"totalSnapshots", "snapshots"}),
        (transform_features, {"partial": "data"}, {"features", "source"}),
        (transform_associated_hosts, {"hosts": None}, {"hosts", "totalFound"}),
        (transform_screenshot, {"image": None}, {"imageUrl", "viewport"}),
        (transform_page_source, {"html": None}, {"html", "contentType"}),
    ],
)
def test_transformers_handle_partial_and_null_values(
    transformer: TransformFn,
    payload: dict[str, Any],
    expected_keys: set[str],
) -> None:
    result = transformer(payload)

    assert isinstance(result, dict)
    assert expected_keys.issubset(result.keys())


@pytest.mark.unit
def test_null_safe_transformers_accept_none() -> None:
    tls_result = transform_tls(None)
    screenshot_result = transform_screenshot(None)
    page_source_result = transform_page_source(None)

    assert tls_result["protocols"] == []
    assert screenshot_result["imageUrl"] == ""
    assert page_source_result["html"] == ""


@pytest.mark.unit
def test_transform_ports_and_tech_stack_return_empty_lists_for_empty_inputs() -> None:
    assert transform_ports({})["entries"] == []
    assert transform_ports({"openPorts": None})["entries"] == []
    assert transform_tech_stack({}) == []
    assert transform_tech_stack({"technologies": None}) == []


@pytest.mark.unit
def test_transform_ranking_and_carbon_handles_none_and_partial_inputs() -> None:
    empty = transform_ranking_and_carbon(None, None, None)
    partial = transform_ranking_and_carbon({"rank": 12}, {"isGreen": True}, None)

    assert empty["ranking"]["globalRank"] is None
    assert empty["carbon"]["isGreen"] is False
    assert partial["ranking"]["globalRank"] == 12
    assert partial["carbon"]["isGreen"] is True


@pytest.mark.unit
def test_transform_hsts_new_scanner_payload() -> None:
    """New scanner payload with explicit enabled/preloadReady/maxAge fields."""
    result = transform_hsts({
        "enabled": True,
        "preloadReady": True,
        "maxAge": 31536000,
        "includeSubDomains": True,
        "preload": True,
        "hstsHeader": "max-age=31536000; includesubdomains; preload",
        "message": "Site is compatible with the HSTS preload list!",
    })

    assert result["enabled"] is True
    assert result["preloadReady"] is True
    assert result["maxAge"] == 31536000
    assert result["includeSubDomains"] is True
    assert result["preload"] is True
    assert result["rawHeader"] == "max-age=31536000; includesubdomains; preload"


@pytest.mark.unit
def test_transform_hsts_legacy_payload_compatible_maps_to_preload_ready() -> None:
    """Legacy payload with only compatible and hstsHeader still produces correct output."""
    result = transform_hsts({
        "compatible": True,
        "hstsHeader": "max-age=31536000; includeSubDomains; preload",
    })

    assert result["enabled"] is True
    assert result["preloadReady"] is True
    assert result["maxAge"] == 31536000
    assert result["includeSubDomains"] is True
    assert result["preload"] is True


@pytest.mark.unit
def test_transform_hsts_lowercase_includesubdomains() -> None:
    """Lowercase includesubdomains in header is parsed correctly."""
    result = transform_hsts({
        "hstsHeader": "max-age=63072000; includesubdomains",
    })

    assert result["enabled"] is True
    assert result["includeSubDomains"] is True
    assert result["preload"] is False
    assert result["preloadReady"] is False


@pytest.mark.unit
def test_transform_hsts_empty_and_missing_payload() -> None:
    """Empty/missing payload defaults safely."""
    result_empty = transform_hsts({})
    result_none = transform_hsts(None)

    for result in (result_empty, result_none):
        assert result["enabled"] is False
        assert result["preloadReady"] is False
        assert result["maxAge"] == 0
        assert result["rawHeader"] == ""
