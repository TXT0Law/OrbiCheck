"""Unit tests for SSRF-oriented URL validation."""

from __future__ import annotations

import socket
from unittest.mock import patch

import pytest

from app.utils.url_safety import validate_url_safety


@pytest.mark.unit
def test_blocks_file_scheme() -> None:
    with pytest.raises(ValueError, match="scheme"):
        validate_url_safety("file:///etc/passwd")


@pytest.mark.unit
def test_blocks_localhost_hostname() -> None:
    with pytest.raises(ValueError, match="Blocked hostname"):
        validate_url_safety("http://localhost/health")


@pytest.mark.unit
def test_blocks_cloud_metadata_hostname() -> None:
    with pytest.raises(ValueError, match="Blocked hostname"):
        validate_url_safety("http://metadata.google.internal/computeMetadata/v1")


@pytest.mark.unit
def test_requires_http_or_https() -> None:
    with pytest.raises(ValueError, match="scheme"):
        validate_url_safety("ldap://example.com")


@pytest.mark.unit
def test_blocks_resolved_private_ip() -> None:
    def _fake_getaddrinfo(
        host: str,
        port: int | None,
        family: int = 0,
        type: int = 0,
        proto: int = 0,
        flags: int = 0,
    ):
        _ = (host, port, family, type, proto, flags)
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("10.0.0.1", 0))]

    with patch("socket.getaddrinfo", _fake_getaddrinfo):
        with pytest.raises(ValueError, match="blocked network"):
            validate_url_safety("http://evil.example.com/")


@pytest.mark.unit
def test_allows_public_https_when_dns_public(monkeypatch) -> None:
    def _fake_getaddrinfo(
        host: str,
        port: int | None,
        family: int = 0,
        type: int = 0,
        proto: int = 0,
        flags: int = 0,
    ):
        _ = (host, port, family, type, proto, flags)
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr(socket, "getaddrinfo", _fake_getaddrinfo)
    validate_url_safety("https://example.com/path")
