"""Symmetric secret encryption used for per-monitor sensitive HTTP auth tokens.

Backed by `cryptography.fernet.Fernet` (AES-128-CBC + HMAC-SHA256). The key is
sourced from the `MONITOR_SECRET_ENCRYPTION_KEY` environment variable; absence
must crash the process at first use so no plaintext secret ever lands in the DB.

The plaintext is never logged. Callers that need to display "is something
configured" should rely on the sentinel-shaped value object the API returns
(`{scheme, configured: bool}`) instead of decrypting on the read path.
"""

from __future__ import annotations

import base64
import binascii
from functools import lru_cache

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings


class MonitorSecretConfigurationError(RuntimeError):
    """Raised when MONITOR_SECRET_ENCRYPTION_KEY is missing or malformed."""


def _validate_fernet_key(raw: str) -> bytes:
    candidate = raw.strip().encode("ascii", errors="ignore")
    if not candidate:
        raise MonitorSecretConfigurationError(
            "MONITOR_SECRET_ENCRYPTION_KEY is required but missing. Generate with "
            "`python -c \"from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())\"`."
        )
    try:
        decoded = base64.urlsafe_b64decode(candidate)
    except (binascii.Error, ValueError) as exc:
        raise MonitorSecretConfigurationError(
            "MONITOR_SECRET_ENCRYPTION_KEY must be a 32-byte url-safe base64 string"
        ) from exc
    if len(decoded) != 32:
        raise MonitorSecretConfigurationError(
            "MONITOR_SECRET_ENCRYPTION_KEY must decode to exactly 32 bytes"
        )
    return candidate


@lru_cache(maxsize=1)
def _get_fernet() -> Fernet:
    raw = getattr(settings, "MONITOR_SECRET_ENCRYPTION_KEY", "")
    key = _validate_fernet_key(str(raw or ""))
    return Fernet(key)


def encrypt_secret(plaintext: str) -> str:
    """Encrypt a UTF-8 plaintext into a base64-armored Fernet token."""
    if not isinstance(plaintext, str):
        raise TypeError("encrypt_secret expects a str plaintext")
    token = _get_fernet().encrypt(plaintext.encode("utf-8"))
    return token.decode("ascii")


def decrypt_secret(ciphertext: str) -> str:
    """Decrypt a Fernet token produced by `encrypt_secret`.

    Raises `MonitorSecretConfigurationError` for malformed tokens. The raised
    exception MUST never include the ciphertext to avoid leaking it via
    structured logs.
    """
    if not isinstance(ciphertext, str) or not ciphertext:
        raise MonitorSecretConfigurationError("ciphertext is empty")
    try:
        plaintext = _get_fernet().decrypt(ciphertext.encode("ascii"))
    except InvalidToken as exc:
        raise MonitorSecretConfigurationError("invalid encrypted secret token") from exc
    return plaintext.decode("utf-8")


def reset_cache_for_tests() -> None:
    """Invalidate the LRU-cached Fernet instance (test helper only)."""
    _get_fernet.cache_clear()
