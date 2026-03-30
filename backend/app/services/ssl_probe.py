"""
SSL certificate probe for monitoring.

Performs TLS handshake against target host, extracts leaf certificate metadata,
Subject Alternative Names (DNS + IP), and the server-presented chain when the
runtime exposes it (e.g. Python 3.13+).

SECURITY NOTE: Uses verify_mode=CERT_NONE to inspect certificates even when
expired, self-signed, or chain-incomplete. This is intentional for monitoring:
we need to read the cert to report on it. The probe does not trust the
certificate — it only reads it (similar to openssl s_client without verification).
"""

from __future__ import annotations

import asyncio
import socket
import ssl
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any
from urllib.parse import urlparse

import structlog
from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.serialization import Encoding

logger = structlog.get_logger(__name__)

PROBE_TIMEOUT_SECONDS: float = 10.0
DEFAULT_HTTPS_PORT: int = 443


@dataclass
class CertificateInfo:
    """Single certificate in chain."""

    subject_dn: str
    issuer_dn: str
    not_before: str
    not_after: str
    serial_number: str
    signature_algorithm: str
    sha256_fingerprint: str
    position: int
    is_leaf: bool

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


@dataclass
class SslProbeResult:
    """Complete SSL probe output."""

    success: bool
    hostname: str
    port: int
    probe_time_ms: float
    days_remaining: int | None = None
    not_before: str | None = None
    not_after: str | None = None
    subject_dn: str | None = None
    issuer_dn: str | None = None
    serial_number: str | None = None
    signature_algorithm: str | None = None
    sha256_fingerprint: str | None = None
    is_valid: bool = False
    is_expired: bool = False
    subject_alternative_names: list[str] = field(default_factory=list)
    chain: list[dict[str, Any]] = field(default_factory=list)
    error_type: str | None = None
    error_message: str | None = None

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


def extract_host_port(url: str) -> tuple[str, int]:
    """Extract hostname and port; default 443 for https, 80 for http."""
    parsed = urlparse(url)
    hostname = parsed.hostname
    if not hostname:
        raise ValueError(f"Cannot extract hostname from URL: {url}")
    port = parsed.port
    if port is None:
        port = 443 if parsed.scheme == "https" else 80
    return hostname, port


def probe_ssl(
    hostname: str,
    port: int = DEFAULT_HTTPS_PORT,
    timeout: float = PROBE_TIMEOUT_SECONDS,
) -> SslProbeResult:
    """Synchronous TLS probe; run from a thread in async code."""
    start = time.monotonic()

    try:
        der_certs = _get_server_certificates(hostname, port, timeout)
        if not der_certs:
            elapsed = (time.monotonic() - start) * 1000
            return SslProbeResult(
                success=False,
                hostname=hostname,
                port=port,
                probe_time_ms=elapsed,
                error_type="SSL_NO_CERTS",
                error_message="Server presented no certificates",
            )

        chain_infos: list[CertificateInfo] = []
        for i, der_bytes in enumerate(der_certs):
            chain_infos.append(_parse_certificate(der_bytes, position=i))
        leaf = chain_infos[0]

        not_after_dt = datetime.fromisoformat(leaf.not_after)
        now = datetime.now(timezone.utc)
        days_remaining = (not_after_dt - now).days
        not_before_dt = datetime.fromisoformat(leaf.not_before)
        is_expired = now > not_after_dt
        is_valid = not_before_dt <= now <= not_after_dt
        sans = _extract_sans(der_certs[0])
        elapsed = (time.monotonic() - start) * 1000

        return SslProbeResult(
            success=True,
            hostname=hostname,
            port=port,
            probe_time_ms=elapsed,
            days_remaining=days_remaining,
            not_before=leaf.not_before,
            not_after=leaf.not_after,
            subject_dn=leaf.subject_dn,
            issuer_dn=leaf.issuer_dn,
            serial_number=leaf.serial_number,
            signature_algorithm=leaf.signature_algorithm,
            sha256_fingerprint=leaf.sha256_fingerprint,
            is_valid=is_valid,
            is_expired=is_expired,
            subject_alternative_names=sans,
            chain=[ci.to_dict() for ci in chain_infos],
        )

    except ssl.SSLError as e:
        elapsed = (time.monotonic() - start) * 1000
        logger.warning("ssl_probe_ssl_error", hostname=hostname, port=port, error=str(e))
        return SslProbeResult(
            success=False,
            hostname=hostname,
            port=port,
            probe_time_ms=elapsed,
            error_type="SSL_ERROR",
            error_message=str(e)[:500],
        )

    except TimeoutError:
        elapsed = (time.monotonic() - start) * 1000
        return SslProbeResult(
            success=False,
            hostname=hostname,
            port=port,
            probe_time_ms=elapsed,
            error_type="SSL_TIMEOUT",
            error_message=f"TLS handshake timed out after {timeout}s",
        )

    except socket.timeout:
        elapsed = (time.monotonic() - start) * 1000
        return SslProbeResult(
            success=False,
            hostname=hostname,
            port=port,
            probe_time_ms=elapsed,
            error_type="SSL_TIMEOUT",
            error_message=f"TLS handshake timed out after {timeout}s",
        )

    except socket.gaierror as e:
        elapsed = (time.monotonic() - start) * 1000
        return SslProbeResult(
            success=False,
            hostname=hostname,
            port=port,
            probe_time_ms=elapsed,
            error_type="DNS_ERROR",
            error_message=str(e)[:500],
        )

    except ConnectionRefusedError:
        elapsed = (time.monotonic() - start) * 1000
        return SslProbeResult(
            success=False,
            hostname=hostname,
            port=port,
            probe_time_ms=elapsed,
            error_type="CONNECTION_REFUSED",
            error_message=f"Connection refused on port {port}",
        )

    except Exception as e:
        elapsed = (time.monotonic() - start) * 1000
        logger.error("ssl_probe_unexpected_error", hostname=hostname, port=port, error=str(e))
        return SslProbeResult(
            success=False,
            hostname=hostname,
            port=port,
            probe_time_ms=elapsed,
            error_type="UNKNOWN",
            error_message=str(e)[:500],
        )


def _get_server_certificates(hostname: str, port: int, timeout: float) -> list[bytes]:
    ctx = ssl.SSLContext(ssl.PROTOCOL_TLS_CLIENT)
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE

    der_certs: list[bytes] = []
    with socket.create_connection((hostname, port), timeout=timeout) as sock:
        sock.settimeout(timeout)
        with ctx.wrap_socket(sock, server_hostname=hostname) as ssock:
            leaf_der = ssock.getpeercert(binary_form=True)
            if leaf_der:
                der_certs.append(leaf_der)
            chain_ders = _get_chain_from_socket(ssock)
            if chain_ders and len(chain_ders) > 1:
                for cert_der in chain_ders[1:]:
                    if cert_der and cert_der not in der_certs:
                        der_certs.append(cert_der)
    return der_certs


def _get_chain_from_socket(ssock: ssl.SSLSocket) -> list[bytes]:
    """Use Python 3.13+ chain APIs when available; otherwise return []."""
    for method_name in ("get_unverified_chain", "get_verified_chain"):
        method = getattr(ssock, method_name, None)
        if not callable(method):
            continue
        try:
            chain = method()
            if not chain:
                continue
            out: list[bytes] = []
            for item in chain:
                if isinstance(item, bytes):
                    out.append(item)
                elif hasattr(item, "public_bytes"):
                    out.append(item.public_bytes(Encoding.DER))
            if out:
                return out
        except Exception:
            continue
    return []


def _parse_certificate(der_bytes: bytes, position: int) -> CertificateInfo:
    cert = x509.load_der_x509_certificate(der_bytes)
    subject_dn = _format_name(cert.subject)
    issuer_dn = _format_name(cert.issuer)
    not_before = cert.not_valid_before_utc.isoformat()
    not_after = cert.not_valid_after_utc.isoformat()
    serial = format(cert.serial_number, "x")
    sig_alg = cert.signature_algorithm_oid._name
    fingerprint = cert.fingerprint(hashes.SHA256())
    sha256_fp = ":".join(f"{b:02X}" for b in fingerprint)
    return CertificateInfo(
        subject_dn=subject_dn,
        issuer_dn=issuer_dn,
        not_before=not_before,
        not_after=not_after,
        serial_number=serial,
        signature_algorithm=sig_alg,
        sha256_fingerprint=sha256_fp,
        position=position,
        is_leaf=(position == 0),
    )


def _extract_sans(der_bytes: bytes) -> list[str]:
    cert = x509.load_der_x509_certificate(der_bytes)
    try:
        san_ext = cert.extensions.get_extension_for_oid(
            x509.oid.ExtensionOID.SUBJECT_ALTERNATIVE_NAME
        )
        san = san_ext.value
    except x509.ExtensionNotFound:
        return []

    results: list[str] = []
    try:
        results.extend(san.get_values_for_type(x509.DNSName))
    except Exception:
        pass
    try:
        results.extend(str(ip) for ip in san.get_values_for_type(x509.IPAddress))
    except Exception:
        pass
    return results


def _format_name(name: x509.Name) -> str:
    """Render RFC 4514-style DN; newest cryptography ``Name`` is not reversible."""
    components: list[str] = []
    for rdn in reversed(name.rdns):
        for attr in rdn:
            try:
                oid_name = attr.oid._name
                components.append(f"{oid_name}={attr.value}")
            except Exception:
                components.append(str(attr))
    return ", ".join(components)


async def probe_ssl_async(
    hostname: str,
    port: int = DEFAULT_HTTPS_PORT,
    timeout: float = PROBE_TIMEOUT_SECONDS,
) -> SslProbeResult:
    """Run :func:`probe_ssl` in the default thread pool."""
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, probe_ssl, hostname, port, timeout)
