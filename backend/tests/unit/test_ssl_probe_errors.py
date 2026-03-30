"""Unit tests for ssl_probe error paths."""

from __future__ import annotations

import socket
import ssl
from unittest.mock import patch

import pytest

from app.services.ssl_probe import probe_ssl


@pytest.mark.unit
def test_probe_ssl_timeout() -> None:
    with patch(
        "app.services.ssl_probe._get_server_certificates",
        side_effect=socket.timeout(),
    ):
        r = probe_ssl("example.com", 443, timeout=1.0)
    assert r.success is False
    assert r.error_type == "SSL_TIMEOUT"


@pytest.mark.unit
def test_probe_ssl_dns_error() -> None:
    with patch(
        "app.services.ssl_probe._get_server_certificates",
        side_effect=socket.gaierror("nxdomain"),
    ):
        r = probe_ssl("does-not-exist.invalid", 443, timeout=1.0)
    assert r.success is False
    assert r.error_type == "DNS_ERROR"


@pytest.mark.unit
def test_probe_ssl_connection_refused() -> None:
    with patch(
        "app.services.ssl_probe._get_server_certificates",
        side_effect=ConnectionRefusedError(),
    ):
        r = probe_ssl("127.0.0.1", 443, timeout=1.0)
    assert r.success is False
    assert r.error_type == "CONNECTION_REFUSED"


@pytest.mark.unit
def test_probe_ssl_ssl_error() -> None:
    with patch(
        "app.services.ssl_probe._get_server_certificates",
        side_effect=ssl.SSLError("bad"),
    ):
        r = probe_ssl("example.com", 443, timeout=1.0)
    assert r.success is False
    assert r.error_type == "SSL_ERROR"


@pytest.mark.unit
def test_probe_ssl_unknown_error() -> None:
    with patch(
        "app.services.ssl_probe._get_server_certificates",
        side_effect=RuntimeError("boom"),
    ):
        r = probe_ssl("example.com", 443, timeout=1.0)
    assert r.success is False
    assert r.error_type == "UNKNOWN"


@pytest.mark.unit
def test_probe_ssl_no_certs() -> None:
    with patch("app.services.ssl_probe._get_server_certificates", return_value=[]):
        r = probe_ssl("example.com", 443, timeout=1.0)
    assert r.success is False
    assert r.error_type == "SSL_NO_CERTS"
