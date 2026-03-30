from __future__ import annotations

from time import sleep

import pytest
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.testclient import TestClient

from app.core import middleware as core_middleware
from app.core.config import settings


def _build_app() -> FastAPI:
    app = FastAPI()
    app.add_middleware(
        CORSMiddleware,
        allow_origins=settings.CORS_ORIGINS,
        allow_credentials=True,
        allow_methods=settings.CORS_ALLOW_METHODS,
        allow_headers=settings.CORS_ALLOW_HEADERS,
    )
    app.add_middleware(core_middleware.SimpleRateLimitMiddleware)
    app.add_middleware(core_middleware.SecurityHeadersMiddleware)

    @app.get("/ping")
    async def ping() -> dict[str, str]:
        return {"status": "ok"}

    return app


def _client() -> TestClient:
    return TestClient(_build_app())


@pytest.mark.unit
def test_cors_headers_are_present_on_preflight(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "CORS_ORIGINS", ["https://frontend.example"])
    client = _client()

    response = client.options(
        "/ping",
        headers={
            "Origin": "https://frontend.example",
            "Access-Control-Request-Method": "GET",
        },
    )

    assert response.status_code == 200
    assert response.headers["access-control-allow-origin"] == "https://frontend.example"


@pytest.mark.unit
def test_security_headers_are_added_to_responses() -> None:
    client = _client()

    response = client.get("/ping")

    assert response.status_code == 200
    assert response.headers["x-content-type-options"] == "nosniff"
    assert response.headers["x-frame-options"] == "DENY"
    assert "content-security-policy" in response.headers


@pytest.mark.unit
def test_rate_limiting_returns_429_after_threshold(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 60)
    monkeypatch.setattr(settings, "RATE_LIMIT_DEFAULT_REQUESTS", 2)
    client = _client()

    first = client.get("/ping")
    second = client.get("/ping")
    third = client.get("/ping")

    assert first.status_code == 200
    assert second.status_code == 200
    assert third.status_code == 429
    assert third.json()["error"]["code"] == "RATE_LIMITED"


@pytest.mark.unit
def test_rate_limiting_resets_after_window(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(settings, "RATE_LIMIT_WINDOW_SECONDS", 1)
    monkeypatch.setattr(settings, "RATE_LIMIT_DEFAULT_REQUESTS", 1)
    client = _client()

    first = client.get("/ping")
    second = client.get("/ping")
    sleep(1.1)
    third = client.get("/ping")

    assert first.status_code == 200
    assert second.status_code == 429
    assert third.status_code == 200
