from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core import security
from app.core.config import settings
from app.core.deps import get_current_user
from app.core.middleware import CsrfProtectionMiddleware


TEST_EMAIL = "admin@example.com"
TEST_PASSWORD = "test-password"
TEST_SESSION_SECRET = "integration-test-session-secret"


def _configure_auth(
    test_app,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_app.dependency_overrides.pop(get_current_user, None)
    test_app.add_middleware(CsrfProtectionMiddleware)
    monkeypatch.setattr(settings, "AUTH_LOGIN_EMAIL", TEST_EMAIL)
    monkeypatch.setattr(settings, "AUTH_LOGIN_PASSWORD", TEST_PASSWORD)
    monkeypatch.setattr(settings, "AUTH_SESSION_SECRET", TEST_SESSION_SECRET)
    monkeypatch.setattr(settings, "AUTH_COOKIE_SECURE", False)


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/scans",
        "/api/v1/monitors",
        "/api/v1/reports",
        "/api/v1/me/notification-settings",
        "/api/v1/url-groups",
    ],
)
async def test_protected_endpoints_return_401_without_user(
    test_app,
    monkeypatch: pytest.MonkeyPatch,
    path: str,
) -> None:
    _configure_auth(test_app, monkeypatch)
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(path)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_health_endpoint_is_available_without_auth(
    test_app,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_auth(test_app, monkeypatch)
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


@pytest.mark.integration
@pytest.mark.asyncio
async def test_login_session_csrf_and_logout_flow(
    test_app,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_auth(test_app, monkeypatch)
    transport = ASGITransport(app=test_app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        login_response = await client.post(
            "/api/v1/auth/login",
            json={"email": TEST_EMAIL, "password": TEST_PASSWORD},
        )
        assert login_response.status_code == 200

        session_response = await client.get("/api/v1/auth/session")
        assert session_response.status_code == 200
        assert session_response.json()["data"] == {
            "authenticated": True,
            "email": TEST_EMAIL,
        }

        missing_csrf_response = await client.post("/api/v1/auth/logout")
        assert missing_csrf_response.status_code == 403
        assert missing_csrf_response.json()["error"]["code"] == "CSRF_INVALID"

        invalid_csrf_response = await client.post(
            "/api/v1/auth/logout",
            headers={"X-CSRF-Token": "wrong-token"},
        )
        assert invalid_csrf_response.status_code == 403

        csrf_token = client.cookies[settings.AUTH_CSRF_COOKIE_NAME]
        logout_response = await client.post(
            "/api/v1/auth/logout",
            headers={"X-CSRF-Token": csrf_token},
        )
        assert logout_response.status_code == 200

        logged_out_response = await client.get("/api/v1/auth/session")
        assert logged_out_response.status_code == 401


@pytest.mark.integration
@pytest.mark.asyncio
async def test_tampered_session_cookie_is_rejected(
    test_app,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_auth(test_app, monkeypatch)
    transport = ASGITransport(app=test_app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        client.cookies.set(settings.AUTH_COOKIE_NAME, "tampered.session")
        response = await client.get("/api/v1/auth/session")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_expired_session_cookie_is_rejected(
    test_app,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _configure_auth(test_app, monkeypatch)
    monkeypatch.setattr(settings, "AUTH_SESSION_TTL_SECONDS", 60)
    monkeypatch.setattr(security.time, "time", lambda: 1_000)
    token = security.create_session_token(
        user_id=1,
        email=TEST_EMAIL,
        csrf_token="csrf-token",
    )
    monkeypatch.setattr(security.time, "time", lambda: 1_200)
    transport = ASGITransport(app=test_app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        client.cookies.set(settings.AUTH_COOKIE_NAME, token)
        response = await client.get("/api/v1/auth/session")

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_development_auth_bypass_skips_session_and_csrf(
    test_app,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    test_app.dependency_overrides.pop(get_current_user, None)
    test_app.add_middleware(CsrfProtectionMiddleware)
    monkeypatch.setattr(settings, "APP_ENV", "development")
    monkeypatch.setattr(settings, "AUTH_DEV_BYPASS_ENABLED", True)
    transport = ASGITransport(app=test_app)

    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        session_response = await client.get("/api/v1/auth/session")
        logout_response = await client.post("/api/v1/auth/logout")

    assert session_response.status_code == 200
    assert session_response.json()["data"]["authenticated"] is True
    assert logout_response.status_code == 200
