"""URL safety validation to reduce SSRF risk for user-supplied probe targets."""

from __future__ import annotations

import ipaddress
import logging
import socket
import time
from dataclasses import dataclass
from urllib.parse import urlsplit

logger = logging.getLogger(__name__)

ALLOWED_SCHEMES = frozenset({"http", "https"})
BLOCKED_HOSTNAMES = frozenset(
    {
        "localhost",
        "127.0.0.1",
        "0.0.0.0",
        "::1",
        "metadata.google.internal",
    }
)
DEFAULT_HTTP_PORT = 80
DEFAULT_HTTPS_PORT = 443


@dataclass(frozen=True)
class ResolvedPublicUrl:
    """Validated URL and the public addresses observed for its hostname."""

    url: str
    hostname: str
    port: int
    addresses: tuple[ipaddress.IPv4Address | ipaddress.IPv6Address, ...]

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


def _resolve_with_retry(hostname: str, port: int | None = None) -> list[tuple]:
    """getaddrinfo wrapper that retries on transient EAI_AGAIN/EAI_NODATA.

    Returns the resolver records on success, otherwise raises the LAST
    ``socket.gaierror`` so the caller's error message stays accurate.
    """
    last_exc: socket.gaierror | None = None
    for attempt in range(DNS_RETRY_ATTEMPTS):
        try:
            return socket.getaddrinfo(
                hostname,
                port,
                socket.AF_UNSPEC,
                socket.SOCK_STREAM,
            )
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


def _is_public_address(
    address: ipaddress.IPv4Address | ipaddress.IPv6Address,
) -> bool:
    """Return True only for globally routable unicast addresses."""

    return address.is_global and not address.is_multicast


def resolve_public_url(
    url: str,
    *,
    require_https: bool = False,
) -> ResolvedPublicUrl:
    """Parse and resolve a URL, rejecting every non-public DNS answer.

    Returning the addresses lets callers pin the subsequent connection to an
    address from this exact validation result instead of resolving again.
    """

    if not isinstance(url, str):
        raise ValueError("URL must be a string")
    candidate = url.strip()
    if not candidate:
        raise ValueError("URL is required")

    parsed = urlsplit(candidate)
    scheme = (parsed.scheme or "").lower()
    if scheme not in ALLOWED_SCHEMES:
        raise ValueError(f"URL scheme not allowed: {parsed.scheme or '(empty)'}")
    if require_https and scheme != "https":
        raise ValueError("URL must use HTTPS")
    if parsed.username is not None or parsed.password is not None:
        raise ValueError("URL credentials are not allowed")

    hostname = parsed.hostname
    if not hostname:
        raise ValueError("URL has no hostname")

    host_lower = hostname.lower().rstrip(".")
    if host_lower in BLOCKED_HOSTNAMES:
        raise ValueError(f"Blocked hostname: {hostname}")
    if "%" in host_lower:
        raise ValueError("IPv6 zone identifiers are not allowed")

    try:
        port = parsed.port
    except ValueError as exc:
        raise ValueError("URL port is invalid") from exc
    if port is None:
        port = DEFAULT_HTTPS_PORT if scheme == "https" else DEFAULT_HTTP_PORT

    try:
        literal = ipaddress.ip_address(host_lower)
    except ValueError:
        try:
            resolved = _resolve_with_retry(hostname, port)
        except socket.gaierror as exc:
            raise ValueError(f"Cannot resolve hostname: {hostname}") from exc

        addresses: list[ipaddress.IPv4Address | ipaddress.IPv6Address] = []
        for _fam, _type, _proto, _canon, sockaddr in resolved:
            if not sockaddr:
                continue
            try:
                address = ipaddress.ip_address(sockaddr[0])
            except ValueError:
                continue
            if address not in addresses:
                addresses.append(address)
    else:
        addresses = [literal]

    if not addresses:
        raise ValueError(f"Cannot resolve hostname: {hostname}")
    for address in addresses:
        if not _is_public_address(address):
            raise ValueError(f"URL resolves to blocked network: {address}")

    return ResolvedPublicUrl(
        url=candidate,
        hostname=hostname,
        port=port,
        addresses=tuple(addresses),
    )


def validate_url_safety(url: str) -> None:
    """
    Raise ValueError if URL targets likely-private or disallowed resources.

    Must be called before outbound HTTP or raw socket connects to user URLs.
    """
    resolve_public_url(url)
