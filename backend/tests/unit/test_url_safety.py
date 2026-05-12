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


# ── R-1: DNS retry on transient EAI_AGAIN ────────────────────────────────


@pytest.mark.unit
def test_dns_resolution_retries_on_transient_eai_again(monkeypatch) -> None:
    """R-1: a single transient EAI_AGAIN (Docker resolver hiccup) must NOT
    fatal-fail the scan; the helper retries up to DNS_RETRY_ATTEMPTS-1 times.
    """
    from app.utils import url_safety as us

    call_count = {"n": 0}

    def _flaky_getaddrinfo(host, port, family=0, type=0, proto=0, flags=0):
        call_count["n"] += 1
        if call_count["n"] == 1:
            raise socket.gaierror(getattr(socket, "EAI_AGAIN", -3), "Try again")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr(us.socket, "getaddrinfo", _flaky_getaddrinfo)
    # Speed up the test — no need to actually wait the backoff.
    monkeypatch.setattr(us.time, "sleep", lambda _s: None)

    validate_url_safety("https://example.com/")
    assert call_count["n"] == 2, "expected exactly one retry after one transient failure"


@pytest.mark.unit
def test_dns_resolution_gives_up_after_max_retries(monkeypatch) -> None:
    """R-1: if every retry fails with EAI_AGAIN, raise ValueError so the
    Celery task surfaces a clear "Cannot resolve hostname" message."""
    from app.utils import url_safety as us

    call_count = {"n": 0}

    def _always_fail(host, port, family=0, type=0, proto=0, flags=0):
        call_count["n"] += 1
        raise socket.gaierror(getattr(socket, "EAI_AGAIN", -3), "Try again")

    monkeypatch.setattr(us.socket, "getaddrinfo", _always_fail)
    monkeypatch.setattr(us.time, "sleep", lambda _s: None)

    with pytest.raises(ValueError, match="Cannot resolve hostname"):
        validate_url_safety("https://example.com/")
    assert call_count["n"] == us.DNS_RETRY_ATTEMPTS


@pytest.mark.unit
def test_dns_resolution_does_not_retry_on_permanent_nxdomain(monkeypatch) -> None:
    """R-1: NXDOMAIN is deterministic — retrying is a waste of probe budget."""
    from app.utils import url_safety as us

    call_count = {"n": 0}

    def _nxdomain(host, port, family=0, type=0, proto=0, flags=0):
        call_count["n"] += 1
        raise socket.gaierror(getattr(socket, "EAI_NONAME", -2), "Name or service not known")

    monkeypatch.setattr(us.socket, "getaddrinfo", _nxdomain)
    sleep_calls = {"n": 0}
    monkeypatch.setattr(us.time, "sleep", lambda _s: sleep_calls.__setitem__("n", sleep_calls["n"] + 1))

    with pytest.raises(ValueError, match="Cannot resolve hostname"):
        validate_url_safety("https://does-not-exist.invalid/")
    assert call_count["n"] == 1, "NXDOMAIN must NOT trigger retry"
    assert sleep_calls["n"] == 0


@pytest.mark.unit
def test_dns_resolution_treats_eai_nodata_as_transient(monkeypatch) -> None:
    """R-1: Docker's embedded resolver returned errno -5 ("no address
    associated with hostname") on cold cache for the user's failed scans.
    That code is bundled with EAI_AGAIN as transient.
    """
    from app.utils import url_safety as us

    call_count = {"n": 0}

    def _flaky(host, port, family=0, type=0, proto=0, flags=0):
        call_count["n"] += 1
        if call_count["n"] < 2:
            raise socket.gaierror(-5, "No address associated with hostname")
        return [(socket.AF_INET, socket.SOCK_STREAM, 6, "", ("93.184.216.34", 0))]

    monkeypatch.setattr(us.socket, "getaddrinfo", _flaky)
    monkeypatch.setattr(us.time, "sleep", lambda _s: None)

    validate_url_safety("https://example.com/")
    assert call_count["n"] == 2
