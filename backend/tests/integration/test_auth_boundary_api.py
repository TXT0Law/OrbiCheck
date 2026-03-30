from __future__ import annotations

import pytest
from httpx import ASGITransport, AsyncClient

from app.core.deps import get_current_user
from app.core.exceptions import AppException


@pytest.mark.integration
@pytest.mark.asyncio
@pytest.mark.parametrize(
    "path",
    [
        "/api/v1/scans",
        "/api/v1/monitors",
    ],
)
async def test_protected_endpoints_return_401_without_user(
    test_app,
    path: str,
) -> None:
    async def _reject() -> None:
        raise AppException(
            code="UNAUTHENTICATED",
            message="Authentication required",
            status_code=401,
        )

    test_app.dependency_overrides[get_current_user] = _reject
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get(path)

    assert response.status_code == 401
    assert response.json()["error"]["code"] == "UNAUTHENTICATED"


@pytest.mark.integration
@pytest.mark.asyncio
async def test_health_endpoint_is_available_without_auth(test_app) -> None:
    test_app.dependency_overrides.pop(get_current_user, None)
    transport = ASGITransport(app=test_app)
    async with AsyncClient(transport=transport, base_url="http://testserver") as client:
        response = await client.get("/api/v1/health")

    assert response.status_code == 200
    assert response.json() == {"status": "ok"}
