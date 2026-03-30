from __future__ import annotations

import pytest

from app.core import security


@pytest.mark.unit
def test_decode_session_token_returns_user_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(security.settings, "AUTH_SESSION_SECRET", "unit-secret")
    token = security.create_session_token(
        user_id=7,
        email="user@example.com",
        csrf_token="csrf-token",
    )

    data = security.decode_session_token(token)

    assert data.user_id == 7
    assert data.email == "user@example.com"
    assert data.csrf_token == "csrf-token"


@pytest.mark.unit
def test_decode_session_token_rejects_expired_token(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(security.settings, "AUTH_SESSION_SECRET", "unit-secret")
    monkeypatch.setattr(security.settings, "AUTH_SESSION_TTL_SECONDS", 60)
    monkeypatch.setattr(security.time, "time", lambda: 1_000)
    token = security.create_session_token(
        user_id=1, email="admin@example.com", csrf_token="csrf-token"
    )
    monkeypatch.setattr(security.time, "time", lambda: 1_200)

    with pytest.raises(ValueError, match="Session expired"):
        security.decode_session_token(token)


@pytest.mark.unit
def test_decode_session_token_rejects_missing_cookie_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(security.settings, "AUTH_SESSION_SECRET", "unit-secret")

    with pytest.raises(ValueError, match="Malformed session token"):
        security.decode_session_token("")


@pytest.mark.unit
def test_decode_session_token_rejects_malformed_cookie_value(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(security.settings, "AUTH_SESSION_SECRET", "unit-secret")

    with pytest.raises(ValueError):
        security.decode_session_token("not-a-valid-token")


@pytest.mark.unit
def test_validate_login_credentials_returns_session_data(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(security.settings, "AUTH_LOGIN_EMAIL", "admin@example.com")
    monkeypatch.setattr(security.settings, "AUTH_LOGIN_PASSWORD", "password123")

    result = security.validate_login_credentials("admin@example.com", "password123")

    assert result.email == "admin@example.com"
    assert result.user_id == 1
    assert result.csrf_token
