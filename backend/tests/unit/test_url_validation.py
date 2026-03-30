"""Unit tests for ScanCreateRequest URL validation."""

import pytest
from pydantic import ValidationError

from app.api.v1.schemas.scan import ScanCreateRequest


@pytest.mark.unit
class TestScanCreateRequestValidation:
    def test_valid_https_url_passes(self) -> None:
        ScanCreateRequest(url="https://example.com")

    def test_valid_http_url_passes(self) -> None:
        ScanCreateRequest(url="http://example.com")

    def test_url_without_protocol_gets_https_prepended(self) -> None:
        req = ScanCreateRequest(url="example.com")
        assert req.url == "https://example.com"

    def test_url_too_long_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://example.com/" + "a" * 2048)

    def test_xss_script_tag_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://example.com/<script>")

    def test_xss_javascript_protocol_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="javascript:alert(1)")

    def test_xss_event_handler_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url='https://x.com" onerror="alert(1)')

    def test_sql_injection_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://x.com'; DROP TABLE scans;--")

    def test_ftp_protocol_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="ftp://example.com")

    def test_localhost_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://localhost")

    def test_private_ip_127_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://127.0.0.1")

    def test_private_ip_10_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://10.0.0.1")

    def test_private_ip_192_168_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://192.168.1.1")

    def test_private_ip_172_16_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://172.16.0.1")

    def test_local_domain_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://myserver.local")

    def test_no_hostname_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://")

    def test_no_tld_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://notadomain")

    def test_control_characters_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="https://example.com\x00")

    def test_data_uri_raises(self) -> None:
        with pytest.raises(ValidationError):
            ScanCreateRequest(url="data:text/html,<h1>test</h1>")

    def test_url_with_path_passes(self) -> None:
        ScanCreateRequest(url="https://example.com/path/page")

    def test_url_with_query_params_passes(self) -> None:
        ScanCreateRequest(url="https://example.com?q=search&lang=en")

    def test_url_with_port_passes(self) -> None:
        ScanCreateRequest(url="https://example.com:8443")

    def test_whitespace_is_trimmed(self) -> None:
        req = ScanCreateRequest(url="  https://example.com  ")
        assert req.url == "https://example.com"
