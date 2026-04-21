"""Unit tests for `app.core.secrets` (Phase 1.1 Fernet helper).

The tests inject a freshly generated Fernet key into `settings` and reset the
LRU cache so tests don't bleed module-level state into each other.
"""

from __future__ import annotations

import pytest
from cryptography.fernet import Fernet

from app.core import secrets as secrets_mod


@pytest.fixture(autouse=True)
def _isolate_fernet_key(monkeypatch):
    monkeypatch.setattr(
        secrets_mod.settings,
        "MONITOR_SECRET_ENCRYPTION_KEY",
        Fernet.generate_key().decode("ascii"),
        raising=False,
    )
    secrets_mod.reset_cache_for_tests()
    yield
    secrets_mod.reset_cache_for_tests()


@pytest.mark.unit
def test_encrypt_then_decrypt_roundtrip() -> None:
    plaintext = "super-secret-bearer-token"
    cipher = secrets_mod.encrypt_secret(plaintext)
    assert isinstance(cipher, str)
    assert plaintext not in cipher
    assert secrets_mod.decrypt_secret(cipher) == plaintext


@pytest.mark.unit
def test_decrypt_rejects_invalid_token() -> None:
    with pytest.raises(secrets_mod.MonitorSecretConfigurationError):
        secrets_mod.decrypt_secret("not-a-real-fernet-token")


@pytest.mark.unit
def test_decrypt_rejects_empty_string() -> None:
    with pytest.raises(secrets_mod.MonitorSecretConfigurationError):
        secrets_mod.decrypt_secret("")


@pytest.mark.unit
def test_missing_key_raises_configuration_error(monkeypatch) -> None:
    monkeypatch.setattr(
        secrets_mod.settings,
        "MONITOR_SECRET_ENCRYPTION_KEY",
        "",
        raising=False,
    )
    secrets_mod.reset_cache_for_tests()
    with pytest.raises(secrets_mod.MonitorSecretConfigurationError):
        secrets_mod.encrypt_secret("anything")


@pytest.mark.unit
def test_invalid_key_format_raises(monkeypatch) -> None:
    monkeypatch.setattr(
        secrets_mod.settings,
        "MONITOR_SECRET_ENCRYPTION_KEY",
        "not-base64-and-not-32-bytes",
        raising=False,
    )
    secrets_mod.reset_cache_for_tests()
    with pytest.raises(secrets_mod.MonitorSecretConfigurationError):
        secrets_mod.encrypt_secret("anything")


@pytest.mark.unit
def test_encrypt_rejects_non_string_plaintext() -> None:
    with pytest.raises(TypeError):
        secrets_mod.encrypt_secret(b"bytes-not-allowed")  # type: ignore[arg-type]
