"""Generate test X.509 certificates for SSL probe unit tests."""

from __future__ import annotations

import ipaddress
from datetime import datetime, timedelta, timezone

from cryptography import x509
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.asymmetric import rsa
from cryptography.hazmat.primitives.serialization import Encoding
from cryptography.x509.oid import NameOID


def generate_key() -> rsa.RSAPrivateKey:
    return rsa.generate_private_key(public_exponent=65537, key_size=2048)


def generate_leaf_cert(
    hostname: str = "example.com",
    sans: list[str] | None = None,
    days_valid: int = 90,
    not_before_offset_days: int = 0,
    issuer_key: rsa.RSAPrivateKey | None = None,
    issuer_name: x509.Name | None = None,
) -> tuple[bytes, rsa.RSAPrivateKey]:
    """Return (DER bytes, private key)."""
    key = generate_key()
    subject = x509.Name(
        [
            x509.NameAttribute(NameOID.COMMON_NAME, hostname),
            x509.NameAttribute(NameOID.ORGANIZATION_NAME, "Test Org"),
        ]
    )

    now = datetime.now(timezone.utc) + timedelta(days=not_before_offset_days)
    builder = (
        x509.CertificateBuilder()
        .subject_name(subject)
        .issuer_name(issuer_name or subject)
        .public_key(key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(now)
        .not_valid_after(now + timedelta(days=days_valid))
    )

    if sans is None:
        sans = [hostname, f"www.{hostname}"]
    if sans:
        san_entries: list[x509.GeneralName] = []
        for s in sans:
            try:
                ip = ipaddress.ip_address(s)
                san_entries.append(x509.IPAddress(ip))
            except ValueError:
                san_entries.append(x509.DNSName(s))
        builder = builder.add_extension(
            x509.SubjectAlternativeName(san_entries),
            critical=False,
        )

    signing_key = issuer_key or key
    cert = builder.sign(signing_key, hashes.SHA256())
    return cert.public_bytes(Encoding.DER), key


def generate_expired_cert(
    hostname: str = "expired.example.com",
) -> tuple[bytes, rsa.RSAPrivateKey]:
    """Certificate that expired ~30 days ago."""
    return generate_leaf_cert(
        hostname=hostname,
        days_valid=60,
        not_before_offset_days=-90,
    )


def generate_cert_no_san(hostname: str = "nosan.example.com") -> tuple[bytes, rsa.RSAPrivateKey]:
    """Leaf cert without SAN extension."""
    return generate_leaf_cert(hostname=hostname, sans=[])


def generate_chain(leaf_hostname: str = "example.com") -> list[bytes]:
    """Return [leaf, intermediate, root] DER bytes."""
    root_key = generate_key()
    root_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test Root CA")])
    root_cert = (
        x509.CertificateBuilder()
        .subject_name(root_name)
        .issuer_name(root_name)
        .public_key(root_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=3650))
        .add_extension(x509.BasicConstraints(ca=True, path_length=1), critical=True)
        .sign(root_key, hashes.SHA256())
    )

    inter_key = generate_key()
    inter_name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, "Test Intermediate")])
    inter_cert = (
        x509.CertificateBuilder()
        .subject_name(inter_name)
        .issuer_name(root_name)
        .public_key(inter_key.public_key())
        .serial_number(x509.random_serial_number())
        .not_valid_before(datetime.now(timezone.utc))
        .not_valid_after(datetime.now(timezone.utc) + timedelta(days=1825))
        .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
        .sign(root_key, hashes.SHA256())
    )

    leaf_der, _ = generate_leaf_cert(
        hostname=leaf_hostname,
        issuer_key=inter_key,
        issuer_name=inter_name,
    )

    return [
        leaf_der,
        inter_cert.public_bytes(Encoding.DER),
        root_cert.public_bytes(Encoding.DER),
    ]
