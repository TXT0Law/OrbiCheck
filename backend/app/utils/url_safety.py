"""URL safety validation to reduce SSRF risk for user-supplied probe targets."""

from __future__ import annotations

import ipaddress
import logging
import socket
import time
from urllib.parse import urlparse

logger = logging.getLogger(__name__)

BLOCKED_SCHEMES = frozenset({"file", "ftp", "gopher", "data"})
BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
    }
)
BLOCKED_NETWORKS = (
    ipaddress.ip_network("10.0.0.0/8"),
    ipaddress.ip_network("172.16.0.0/12"),
    ipaddress.ip_network("192.168.0.0/16"),
    ipaddress.ip_network("169.254.0.0/16"),
    ipaddress.ip_network("100.64.0.0/10"),
    ipaddress.ip_network("127.0.0.0/8"),
    ipaddress.ip_network("::1/128"),
    ipaddress.ip_network("fc00::/7"),
    ipaddress.ip_network("fe80::/10"),
)

# R-1: Docker's embedded DNS resolver (127.0.0.11) intermittently returns
# EAI_AGAIN under load — every transient blip used to immediately fail
# `validate_url_safety` and mark the entire scan as a fatal failure (the
# user saw 4/5 scans go red because their DNS hiccupped during enqueue).
# Retry once with a small backoff so a single packet drop / cold cache
# does not poison the whole scan; the loop is bounded so a truly missing
# domain still reports the original gaierror.
DNS_RETRY_ATTEMPTS = 3
DNS_RETRY_BACKOFF_SECONDS = 0.2
# `EAI_AGAIN` is the only error code we treat as transient. NXDOMAIN
# (`EAI_NONAME`) and "no address associated with hostname" (`EAI_NODATA`)
# are deterministic — retrying just doubles the user-visible latency.
_TRANSIENT_GAI_ERRNOS: frozenset[int] = frozenset(
    {
        getattr(socket, "EAI_AGAIN", -3),
        # On glibc, EAI_NODATA is reported as EAI_NONAME with no answer; some
        # macOS / musl libcs return -5 ("no address associated"). The Docker
        # log we observed (errno -5) suggests the embedded resolver returns
        # EAI_NODATA on cold cache, so retry it as well.
        -5,
    }
)


def _resolve_with_retry(hostname: str) -> list[tuple]:
    """getaddrinfo wrapper that retries on transient EAI_AGAIN/EAI_NODATA.

    Returns the resolver records on success, otherwise raises the LAST
    ``socket.gaierror`` so the caller's error message stays accurate.
    """
    last_exc: socket.gaierror | None = None
    for attempt in range(DNS_RETRY_ATTEMPTS):
        try:
            return socket.getaddrinfo(hostname, None, socket.AF_UNSPEC)
        except socket.gaierror as exc:
            last_exc = exc
            if exc.errno not in _TRANSIENT_GAI_ERRNOS:
                # Non-transient (NXDOMAIN, etc.) — fail fast.
                raise
            if attempt + 1 >= DNS_RETRY_ATTEMPTS:
                break
            logger.warning(
                "url_safety: transient DNS failure for %s (errno=%s, attempt %d/%d), retrying",
                hostname,
                exc.errno,
                attempt + 1,
                DNS_RETRY_ATTEMPTS,
            )
            time.sleep(DNS_RETRY_BACKOFF_SECONDS * (attempt + 1))
    assert last_exc is not None  # noqa: S101 — invariant: loop always sets last_exc
    raise last_exc


def validate_url_safety(url: str) -> None:
    """
    Raise ValueError if URL targets likely-private or disallowed resources.

    Must be called before outbound HTTP or raw socket connects to user URLs.
    """
    parsed = urlparse(url)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ("http", "https"):
        raise ValueError(f"URL scheme not allowed: {parsed.scheme or '(empty)'}")
    if scheme in BLOCKED_SCHEMES:
        raise ValueError(f"Blocked URL scheme: {parsed.scheme}")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL has no hostname")

    host_lower = hostname.lower().rstrip(".")
    if host_lower in BLOCKED_HOSTNAMES:
        raise ValueError(f"Blocked hostname: {hostname}")

    try:
        resolved = _resolve_with_retry(hostname)
    except socket.gaierror as exc:
        raise ValueError(f"Cannot resolve hostname: {hostname}") from exc

    for _fam, _type, _proto, _canon, sockaddr in resolved:
        if not sockaddr:
            continue
        ip_str = sockaddr[0]
        try:
            ip = ipaddress.ip_address(ip_str)
        except ValueError:
            continue
        for network in BLOCKED_NETWORKS:
            if ip in network:
                raise ValueError(f"URL resolves to blocked network: {ip}")
