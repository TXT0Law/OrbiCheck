from http.cookies import SimpleCookie
from types import SimpleNamespace

import pytest

from app.api.v1.endpoints import auth as auth_endpoints


@pytest.mark.asyncio
@pytest.mark.integration
async def test_login_sets_session_and_csrf_cookies(async_client, monkeypatch) -> None:
    fake_session = SimpleNamespace(
        user_id=1,
        email="admin@orbicheck.local",
        csrf_token="csrf-token",
    )
    monkeypatch.setattr(
        auth_endpoints,
        "validate_login_credentials",
        lambda email, password: fake_session,
    )
    monkeypatch.setattr(
        auth_endpoints,
        "create_session_token",
        lambda **kwargs: "signed-session-token",
    )

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@orbicheck.local", "password": "secret"},
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["status"] == "success"
    assert payload["data"] == {
        "authenticated": True,
        "email": "admin@orbicheck.local",
    }

    cookie = SimpleCookie()
    for header_value in response.headers.get_list("set-cookie"):
        cookie.load(header_value)

    assert cookie["orbicheck_auth"].value == "signed-session-token"
    assert cookie["orbicheck_auth"]["httponly"]
    assert cookie["orbicheck_csrf"].value == "csrf-token"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_login_rejects_invalid_credentials(async_client, monkeypatch) -> None:
    def _invalid(_email: str, _password: str):
        raise ValueError("Invalid email or password")

    monkeypatch.setattr(auth_endpoints, "validate_login_credentials", _invalid)

    response = await async_client.post(
        "/api/v1/auth/login",
        json={"email": "admin@orbicheck.local", "password": "wrong"},
    )

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "INVALID_CREDENTIALS"
