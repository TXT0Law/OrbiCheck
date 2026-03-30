from __future__ import annotations

import base64
import hashlib
import hmac
import json
import secrets
import time
from dataclasses import dataclass

from app.core.config import settings


@dataclass(frozen=True, slots=True)
class SessionData:
    user_id: int
    email: str
    csrf_token: str
    issued_at: int


def _get_secret_bytes() -> bytes:
    secret = settings.AUTH_SESSION_SECRET.strip()
    if not secret:
        raise ValueError("AUTH_SESSION_SECRET is not configured")
    return secret.encode("utf-8")


def _encode_part(raw: bytes) -> str:
    return base64.urlsafe_b64encode(raw).decode("ascii").rstrip("=")


def _decode_part(raw: str) -> bytes:
    padding = "=" * (-len(raw) % 4)
    return base64.urlsafe_b64decode(f"{raw}{padding}".encode("ascii"))


def _sign(payload_b64: str) -> str:
    signature = hmac.new(
        _get_secret_bytes(),
        payload_b64.encode("utf-8"),
        hashlib.sha256,
    ).digest()
    return _encode_part(signature)


def create_csrf_token() -> str:
    return secrets.token_urlsafe(32)


def create_session_token(*, user_id: int, email: str, csrf_token: str) -> str:
    payload = {
        "uid": user_id,
        "email": email,
        "csrf": csrf_token,
        "iat": int(time.time()),
    }
    payload_b64 = _encode_part(
        json.dumps(payload, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    return f"{payload_b64}.{_sign(payload_b64)}"


def decode_session_token(token: str) -> SessionData:
    try:
        payload_b64, provided_sig = token.split(".", 1)
    except ValueError as exc:
        raise ValueError("Malformed session token") from exc

    expected_sig = _sign(payload_b64)
    if not hmac.compare_digest(provided_sig, expected_sig):
        raise ValueError("Invalid session signature")

    try:
        payload = json.loads(_decode_part(payload_b64).decode("utf-8"))
    except (ValueError, json.JSONDecodeError) as exc:
        raise ValueError("Invalid session payload") from exc

    issued_at = int(payload.get("iat", 0))
    max_age = max(60, int(settings.AUTH_SESSION_TTL_SECONDS))
    if issued_at <= 0 or int(time.time()) - issued_at > max_age:
        raise ValueError("Session expired")

    user_id = int(payload.get("uid", 0))
    email = str(payload.get("email", "")).strip().lower()
    csrf_token = str(payload.get("csrf", "")).strip()
    if user_id <= 0 or not email or not csrf_token:
        raise ValueError("Session payload missing required fields")

    return SessionData(
        user_id=user_id,
        email=email,
        csrf_token=csrf_token,
        issued_at=issued_at,
    )


def validate_login_credentials(email: str, password: str) -> SessionData:
    configured_email = settings.AUTH_LOGIN_EMAIL.strip().lower()
    configured_password = settings.AUTH_LOGIN_PASSWORD
    if not configured_email or not configured_password:
        raise ValueError("Login credentials are not configured on the server")

    email_normalized = email.strip().lower()
    if not hmac.compare_digest(email_normalized, configured_email) or not hmac.compare_digest(
        password,
        configured_password,
    ):
        raise ValueError("Invalid email or password")

    return SessionData(
        user_id=1,
        email=configured_email,
        csrf_token=create_csrf_token(),
        issued_at=int(time.time()),
    )
