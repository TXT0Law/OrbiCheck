import pytest

from app.services.transformers import (
    _parse_set_cookie_header,
    build_module_errors,
    build_scan_detail,
    transform_cookies,
    transform_features,
    transform_page_source,
    transform_redirects,
    transform_screenshot,
    transform_traceroute,
    transform_whois,
)


class _FakeStatus:
    def __init__(self, value: str):
        self.value = value


class _FakeModuleResult:
    def __init__(self, module_name: str, status: str, error_message=None, raw_result=None):
        self.module_name = module_name
        self.status = _FakeStatus(status)
        self.error_message = error_message
        self.raw_result = raw_result


@pytest.mark.unit
def test_transform_whois_accepts_internic_keys():
    raw = {
        "internicData": {
            "Registrar": "Example Registrar",
            "Creation_Date": "2020-01-01",
            "Updated_Date": "2024-01-01",
            "Expiry_Date": "2030-01-01",
            "Name_Servers": ["ns1.example.com", "ns2.example.com"],
            "Domain_Status": ["ok"],
        }
    }

    data = transform_whois(raw)

    assert data["registrar"] == "Example Registrar"
    assert data["createdAt"] == "2020-01-01"
    assert data["updatedAt"] == "2024-01-01"
    assert data["expiresAt"] == "2030-01-01"
    assert data["nameservers"] == ["ns1.example.com", "ns2.example.com"]
    assert data["domainStatus"] == ["ok"]


@pytest.mark.unit
def test_transform_redirects_accepts_string_hops():
    data = transform_redirects({"redirects": ["https://a.example", "https://b.example"]})

    assert data["totalRedirects"] == 1
    assert data["finalUrl"] == "https://b.example"
    assert data["hops"][0]["statusCode"] == 0
    assert data["hops"][0]["responseTimeMs"] == 0


@pytest.mark.unit
def test_transform_traceroute_normalizes_rtt_array():
    raw = {
        "hops": [
            {"hop": 1, "ip": "10.0.0.1", "hostname": "gateway", "rttMs": [1.2, 1.4, 1.6]},
            {"hop": 2, "ip": "203.0.113.10", "hostname": None, "rttMs": 24},
        ]
    }

    data = transform_traceroute(raw)

    assert data["totalHops"] == 2
    assert data["hops"][0]["rttMs"] == 1.4
    assert data["hops"][1]["rttMs"] == 24.0


@pytest.mark.unit
def test_transform_features_accepts_json_string_payload():
    raw = '{"features":[{"name":"React","detected":true,"category":"Framework"}]}'

    data = transform_features(raw)

    assert len(data["features"]) == 1
    assert data["features"][0]["name"] == "React"


@pytest.mark.unit
def test_build_scan_detail_returns_renderable_defaults_for_missing_modules():
    detail = build_scan_detail("scan-1", "https://example.com", all_raw_results={})

    assert detail["whois"] is not None
    assert detail["ports"] == []
    assert detail["redirects"]["hops"] == []
    assert detail["traceroute"]["hops"] == []
    assert detail["features"]["features"] == []
    assert detail["screenshot"]["imageUrl"] == ""


@pytest.mark.unit
def test_transform_cookies_puppeteer_client_cookies():
    """Cookies module returns { clientCookies } (Puppeteer format)."""
    raw = {
        "clientCookies": [
            {
                "name": "session_id",
                "value": "abc123",
                "domain": ".example.com",
                "path": "/",
                "expires": 1735689600,  # Unix timestamp
                "httpOnly": True,
                "secure": True,
                "sameSite": "Lax",
            },
        ]
    }
    data = transform_cookies(raw)
    assert len(data["cookies"]) == 1
    c = data["cookies"][0]
    assert c["name"] == "session_id"
    assert c["domain"] == ".example.com"
    assert c["path"] == "/"
    assert c["secure"] is True
    assert c["httpOnly"] is True
    assert c["sameSite"] == "lax"
    assert "UTC" in c["expires"] or "2024" in c["expires"]

@pytest.mark.unit
def test_transform_cookies_header_cookies_fallback():
    """Cookies module returns { headerCookies } when Puppeteer fails."""
    raw = {
        "headerCookies": [
            "__cf_bm=abc; path=/; expires=Wed, 18 Mar 2026 00:00:00 GMT; "
            "domain=.arena.ai; HttpOnly; Secure; SameSite=None",
        ]
    }
    data = transform_cookies(raw)
    assert len(data["cookies"]) == 1
    c = data["cookies"][0]
    assert c["name"] == "__cf_bm"
    assert c["domain"] == ".arena.ai"
    assert c["path"] == "/"
    assert c["secure"] is True
    assert c["httpOnly"] is True
    assert c["sameSite"] == "none"


@pytest.mark.unit
def test_transform_cookies_handles_skipped_and_error():
    """Cookies module may return { skipped } or { error }."""
    assert transform_cookies({"skipped": "No cookies"})["cookies"] == []
    assert transform_cookies({"error": "Request failed"})["cookies"] == []


@pytest.mark.unit
def test_parse_set_cookie_header_extracts_name_and_attributes():
    """_parse_set_cookie_header parses Set-Cookie header into name + attrs."""
    result = _parse_set_cookie_header(
        "session=abc123; path=/; HttpOnly; Secure; SameSite=Lax"
    )
    assert result is not None
    assert result["name"] == "session"
    assert result["path"] == "/"
    assert result["httpOnly"] is True
    assert result["secure"] is True
    assert result["sameSite"] == "lax"


@pytest.mark.unit
def test_transform_screenshot_top_level_image():
    """Screenshot with image at top level returns data URL."""
    raw = {"image": "abc123base64", "viewport": "1280x720"}
    result = transform_screenshot(raw)
    assert result["imageUrl"] == "data:image/png;base64,abc123base64"
    assert result["viewport"] == "1280x720"


@pytest.mark.unit
def test_transform_screenshot_nested_data_image():
    """Screenshot with image under data key."""
    raw = {"data": {"image": "nestedBase64"}}
    result = transform_screenshot(raw)
    assert result["imageUrl"] == "data:image/png;base64,nestedBase64"


@pytest.mark.unit
def test_transform_screenshot_screenshot_field_fallback():
    """Screenshot with screenshot field as fallback."""
    raw = {"screenshot": "fallbackBase64"}
    result = transform_screenshot(raw)
    assert result["imageUrl"] == "data:image/png;base64,fallbackBase64"


@pytest.mark.unit
def test_transform_screenshot_nested_data_screenshot():
    """Screenshot with data.screenshot field (legacy nested)."""
    raw = {"data": {"screenshot": "nestedScreenshotBase64"}}
    result = transform_screenshot(raw)
    assert result["imageUrl"] == "data:image/png;base64,nestedScreenshotBase64"


@pytest.mark.unit
def test_transform_screenshot_empty_when_no_image():
    """Screenshot with success:false and no image returns empty imageUrl."""
    raw = {"success": False, "error": "Chromium not found"}
    result = transform_screenshot(raw)
    assert result["imageUrl"] == ""


@pytest.mark.unit
def test_transform_screenshot_null_input():
    """Screenshot transformer handles None input."""
    result = transform_screenshot(None)
    assert result["imageUrl"] == ""
    assert result["viewport"] == "1280x720"


@pytest.mark.unit
def test_transform_screenshot_unavailable_reason_from_note():
    """Screenshot shows unavailableReason when Chromium not found."""
    raw = {
        "success": True,
        "image": None,
        "data": {
            "note": "Chromium not found at /usr/bin/chromium. Install Chromium.",
        },
    }
    result = transform_screenshot(raw)
    assert result["imageUrl"] == ""
    assert "Chromium not found" in (result.get("unavailableReason") or "")


@pytest.mark.unit
def test_transform_page_source_normal_html():
    """Page source with valid HTML returns full structure."""
    raw = {
        "html": "<!DOCTYPE html><html></html>",
        "statusCode": 200,
        "contentType": "text/html; charset=utf-8",
        "contentLength": 27,
        "truncated": False,
    }
    result = transform_page_source(raw)
    assert result["html"] == "<!DOCTYPE html><html></html>"
    assert result["statusCode"] == 200
    assert result["contentType"] == "text/html; charset=utf-8"
    assert result["contentLength"] == 27
    assert result["truncated"] is False


@pytest.mark.unit
def test_transform_page_source_empty_raw():
    """Page source with empty dict returns defaults."""
    result = transform_page_source({})
    assert result["html"] == ""
    assert result["statusCode"] is None
    assert result["contentLength"] == 0
    assert result["truncated"] is False


@pytest.mark.unit
def test_transform_page_source_none_input():
    """Page source transformer handles None input."""
    result = transform_page_source(None)
    assert result["html"] == ""


@pytest.mark.unit
def test_transform_page_source_nested_data():
    """Page source with html under data key."""
    raw = {"data": {"html": "<p>Hello</p>", "statusCode": 200}}
    result = transform_page_source(raw)
    assert result["html"] == "<p>Hello</p>"
    assert result["statusCode"] == 200


@pytest.mark.unit
def test_build_scan_detail_includes_page_source():
    """build_scan_detail includes pageSource when page-source module present."""
    all_raw = {
        "page-source": {
            "html": "<html></html>",
            "statusCode": 200,
            "contentType": "text/html",
            "contentLength": 14,
            "truncated": False,
        },
    }
    detail = build_scan_detail("scan-1", "https://example.com", all_raw)
    assert "pageSource" in detail
    assert detail["pageSource"]["html"] == "<html></html>"
    assert detail["pageSource"]["statusCode"] == 200


@pytest.mark.unit
def test_build_module_errors_includes_failed_and_timeout_modules_only():
    module_results = [
        _FakeModuleResult("whois", "failed", "whois timeout"),
        _FakeModuleResult("features", "timeout", raw_result={"error": "module timeout"}),
        _FakeModuleResult("ports", "success", raw_result={"error": "ignored"}),
    ]

    errors = build_module_errors(module_results)

    assert set(errors.keys()) == {"whois", "features"}
    assert errors["whois"]["status"] == "failed"
    assert errors["whois"]["message"] == "whois timeout"
    assert errors["features"]["frontendKey"] == "features"
    assert errors["features"]["message"] == "module timeout"
