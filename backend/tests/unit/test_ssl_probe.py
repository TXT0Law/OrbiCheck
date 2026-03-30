"""Unit tests for ssl_probe parsing, SAN, chain, host/port extraction."""

from __future__ import annotations

from unittest.mock import patch

import pytest

from app.services import ssl_probe
from app.services.ssl_probe import (
    extract_host_port,
    probe_ssl,
)
from tests.fixtures.ssl_certs import (
    generate_cert_no_san,
    generate_chain,
    generate_expired_cert,
    generate_leaf_cert,
)


@pytest.mark.unit
def test_extract_host_port_https_default_443() -> None:
    h, p = extract_host_port("https://example.com/path")
    assert h == "example.com"
    assert p == 443


@pytest.mark.unit
def test_extract_host_port_explicit_port() -> None:
    h, p = extract_host_port("https://example.com:8443/")
    assert h == "example.com"
    assert p == 8443


@pytest.mark.unit
def test_extract_host_port_http_default_80() -> None:
    h, p = extract_host_port("http://example.com/")
    assert p == 80


@pytest.mark.unit
def test_extract_host_port_missing_hostname_raises() -> None:
    with pytest.raises(ValueError, match="hostname"):
        extract_host_port("https:///nohost")


@pytest.mark.unit
def test_parse_certificate_and_san_dns() -> None:
    der, _ = generate_leaf_cert("svc.test", sans=["svc.test", "alt.test"])
    info = ssl_probe._parse_certificate(der, 0)
    assert "svc.test" in info.subject_dn or "COMMON_NAME=svc.test" in info.subject_dn
    assert info.position == 0
    assert info.is_leaf is True
    sans = ssl_probe._extract_sans(der)
    assert "svc.test" in sans
    assert "alt.test" in sans


@pytest.mark.unit
def test_extract_san_ip() -> None:
    der, _ = generate_leaf_cert("t", sans=["127.0.0.1"])
    sans = ssl_probe._extract_sans(der)
    assert "127.0.0.1" in sans


@pytest.mark.unit
def test_cert_no_san_extension() -> None:
    der, _ = generate_cert_no_san()
    assert ssl_probe._extract_sans(der) == []


@pytest.mark.unit
def test_parse_three_cert_chain_positions() -> None:
    ders = generate_chain("leaf.example.com")
    assert len(ders) == 3
    for i, der in enumerate(ders):
        info = ssl_probe._parse_certificate(der, i)
        assert info.position == i
        assert info.is_leaf == (i == 0)


@pytest.mark.unit
def test_probe_ssl_success_mocked_chain() -> None:
    der, _ = generate_leaf_cert()
    with patch.object(ssl_probe, "_get_server_certificates", return_value=[der]):
        r = probe_ssl("example.com", 443, timeout=2.0)
    assert r.success is True
    assert r.days_remaining is not None
    assert len(r.subject_alternative_names) >= 1
    assert len(r.chain) == 1


@pytest.mark.unit
def test_probe_ssl_expired_mocked() -> None:
    der, _ = generate_expired_cert()
    with patch.object(ssl_probe, "_get_server_certificates", return_value=[der]):
        r = probe_ssl("expired.example.com", 443, timeout=2.0)
    assert r.success is True
    assert r.is_expired is True
    assert r.days_remaining is not None
    assert r.days_remaining < 0
