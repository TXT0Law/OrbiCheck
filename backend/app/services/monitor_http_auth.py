"""Encrypted monitor HTTP credentials and probe request headers."""

from __future__ import annotations

import base64

import structlog

from app.api.v1.schemas.monitor import HttpAuthInputSchema, HttpAuthSummary
from app.core.config import settings
from app.core.exceptions import ValidationError
from app.core.secrets import (
    MonitorSecretConfigurationError,
    decrypt_secret,
    encrypt_secret,
)
from app.models.monitor import Monitor

logger = structlog.get_logger(__name__)


def _encrypt_http_auth_envelope(
    auth_input: HttpAuthInputSchema | None,
    existing: dict | None,
) -> dict | None:
    """Create a stored envelope without persisting a plaintext token."""
    if auth_input is None:
        return existing
    if auth_input.scheme == "none":
        return None
    if auth_input.token is None:
        if not existing or not existing.get("token_ciphertext"):
            raise ValidationError(
                code="MONITOR_HTTP_AUTH_TOKEN_REQUIRED",
                message="httpAuth.token is required when no token is configured",
            )
        return {
            "scheme": auth_input.scheme,
            "token_ciphertext": existing["token_ciphertext"],
        }
    try:
        ciphertext = encrypt_secret(auth_input.token)
    except MonitorSecretConfigurationError as exc:
        raise ValidationError(
            code="MONITOR_SECRET_KEY_MISSING",
            message=str(exc),
        ) from exc
    return {"scheme": auth_input.scheme, "token_ciphertext": ciphertext}


def _http_auth_summary_from_envelope(envelope: dict | None) -> HttpAuthSummary:
    if not envelope or not isinstance(envelope, dict):
        return HttpAuthSummary()
    scheme = str(envelope.get("scheme", "none"))
    if scheme not in ("none", "bearer", "basic"):
        scheme = "none"
    return HttpAuthSummary(
        scheme=scheme,
        configured=bool(envelope.get("token_ciphertext")),
    )


def _resolve_http_auth_envelope(envelope: dict | None) -> tuple[str, str | None]:
    """Return decrypted credentials to the probe runner without logging them."""
    if not envelope or not isinstance(envelope, dict):
        return "none", None
    scheme = str(envelope.get("scheme", "none"))
    if scheme not in ("bearer", "basic"):
        return "none", None
    cipher = envelope.get("token_ciphertext")
    if not isinstance(cipher, str) or not cipher:
        return "none", None
    try:
        return scheme, decrypt_secret(cipher)
    except MonitorSecretConfigurationError:
        logger.error(
            "monitor_http_auth_decrypt_failed",
            scheme=scheme,
            reason="invalid_or_missing_key",
        )
        return "none", None


def _build_probe_request_headers(monitor: Monitor) -> dict[str, str]:
    """Merge probe headers, with configured Authorization taking precedence."""
    headers: dict[str, str] = {"User-Agent": settings.MONITOR_PROBE_USER_AGENT}
    custom = monitor.http_headers or {}
    if isinstance(custom, dict):
        for name, value in custom.items():
            if not isinstance(name, str) or not isinstance(value, str):
                continue
            headers[name] = value
    scheme, token = _resolve_http_auth_envelope(monitor.http_auth)
    if token is not None:
        if scheme == "bearer":
            headers["Authorization"] = f"Bearer {token}"
        elif scheme == "basic":
            encoded = base64.b64encode(token.encode("utf-8")).decode("ascii")
            headers["Authorization"] = f"Basic {encoded}"
    return headers
