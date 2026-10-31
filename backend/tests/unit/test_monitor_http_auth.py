"""Monitor HTTP credential storage and probe header boundaries."""

from __future__ import annotations

import base64
from types import SimpleNamespace

import pytest

from app.api.v1.schemas.monitor import HttpAuthInputSchema
from app.core.exceptions import ValidationError
from app.core.secrets import MonitorSecretConfigurationError
from app.services import monitor_http_auth


@pytest.mark.unit
def test_http_auth_envelope_never_returns_plaintext(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fake_encryption(_token: str) -> str:
        return "encrypted"

    monkeypatch.setattr(monitor_http_auth, "encrypt_secret", fake_encryption)

    envelope = monitor_http_auth._encrypt_http_auth_envelope(
        HttpAuthInputSchema(scheme="bearer", token="private-token"), None
    )

    assert envelope == {"scheme": "bearer", "token_ciphertext": "encrypted"}
    summary = monitor_http_auth._http_auth_summary_from_envelope(envelope)
    assert summary.model_dump() == {"scheme": "bearer", "configured": True}
    assert "private-token" not in str(envelope)


@pytest.mark.unit
def test_http_auth_envelope_preserves_or_clears_existing_secret() -> None:
    existing = {"scheme": "bearer", "token_ciphertext": "encrypted"}

    preserved = monitor_http_auth._encrypt_http_auth_envelope(
        HttpAuthInputSchema(scheme="basic"), existing
    )
    cleared = monitor_http_auth._encrypt_http_auth_envelope(
        HttpAuthInputSchema(scheme="none"), existing
    )

    assert preserved == {"scheme": "basic", "token_ciphertext": "encrypted"}
    assert cleared is None
    with pytest.raises(ValidationError) as error:
        monitor_http_auth._encrypt_http_auth_envelope(
            HttpAuthInputSchema(scheme="bearer"), None
        )
    assert error.value.code == "MONITOR_HTTP_AUTH_TOKEN_REQUIRED"


@pytest.mark.unit
def test_missing_encryption_key_has_specific_validation_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    def fail_encryption(_token: str) -> str:
        raise MonitorSecretConfigurationError("missing key")

    monkeypatch.setattr(monitor_http_auth, "encrypt_secret", fail_encryption)

    with pytest.raises(ValidationError) as error:
        monitor_http_auth._encrypt_http_auth_envelope(
            HttpAuthInputSchema(scheme="bearer", token="private-token"), None
        )

    assert error.value.code == "MONITOR_SECRET_KEY_MISSING"


@pytest.mark.unit
@pytest.mark.parametrize(
    ("scheme", "token", "expected"),
    [
        ("bearer", "private-token", "Bearer private-token"),
        (
            "basic",
            "alice:password",
            "Basic " + base64.b64encode(b"alice:password").decode("ascii"),
        ),
    ],
)
def test_probe_authorization_overrides_custom_header(
    monkeypatch: pytest.MonkeyPatch,
    scheme: str,
    token: str,
    expected: str,
) -> None:
    def fake_decryption(_cipher: str) -> str:
        return token

    monkeypatch.setattr(monitor_http_auth, "decrypt_secret", fake_decryption)
    monitor = SimpleNamespace(
        http_headers={"Authorization": "custom", "X-Probe": "trace"},
        http_auth={"scheme": scheme, "token_ciphertext": "encrypted"},
    )

    headers = monitor_http_auth._build_probe_request_headers(monitor)

    assert headers["Authorization"] == expected
    assert headers["X-Probe"] == "trace"
    assert headers["User-Agent"]


@pytest.mark.unit
def test_invalid_envelope_omits_authorization(monkeypatch: pytest.MonkeyPatch) -> None:
    def fail_decryption(_cipher: str) -> str:
        raise MonitorSecretConfigurationError("invalid encrypted secret token")

    monkeypatch.setattr(monitor_http_auth, "decrypt_secret", fail_decryption)
    monitor = SimpleNamespace(
        http_headers={},
        http_auth={"scheme": "bearer", "token_ciphertext": "corrupted"},
    )

    headers = monitor_http_auth._build_probe_request_headers(monitor)

    assert "Authorization" not in headers
