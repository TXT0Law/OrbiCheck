"""URL safety validation to reduce SSRF risk for user-supplied probe targets."""

from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

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
        resolved = socket.getaddrinfo(hostname, None, socket.AF_UNSPEC)
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
