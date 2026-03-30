from __future__ import annotations

import pytest

from app.core.config import Settings


@pytest.mark.unit
def test_settings_load_with_explicit_env_values(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("DATABASE_URL", "postgresql+asyncpg://user:pass@localhost/db")
    monkeypatch.setenv("REDIS_URL", "redis://localhost:6379/2")
    monkeypatch.setenv("SCAN_SERVICE_URL", "http://localhost:4999")
    monkeypatch.setenv("DEBUG", "true")

    settings = Settings(_env_file=None)

    assert settings.DATABASE_URL.endswith("/db")
    assert settings.REDIS_URL.endswith("/2")
    assert settings.SCAN_SERVICE_URL == "http://localhost:4999"
    assert settings.DEBUG is True


@pytest.mark.unit
def test_settings_use_fallbacks_when_database_and_redis_are_missing(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("REDIS_URL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.DATABASE_URL == ""
    assert settings.REDIS_URL == "redis://localhost:6379/0"


@pytest.mark.unit
def test_settings_default_scan_service_url(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.delenv("SCAN_SERVICE_URL", raising=False)

    settings = Settings(_env_file=None)

    assert settings.SCAN_SERVICE_URL == "http://localhost:4000"


@pytest.mark.unit
def test_settings_parse_boolean_fields(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "false")
    monkeypatch.setenv("MONITOR_INLINE_DISPATCH", "1")
    monkeypatch.setenv("CONTENT_NORMALIZATION_ENABLED", "0")

    settings = Settings(_env_file=None)

    assert settings.AUTH_COOKIE_SECURE is False
    assert settings.MONITOR_INLINE_DISPATCH is True
    assert settings.CONTENT_NORMALIZATION_ENABLED is False


@pytest.mark.unit
def test_settings_parse_cors_lists(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setenv(
        "CORS_ORIGINS", '["http://localhost:3000", "https://example.com"]'
    )
    monkeypatch.setenv("CORS_ALLOW_HEADERS", '["Accept", "Content-Type"]')

    settings = Settings(_env_file=None)

    assert settings.CORS_ORIGINS == ["http://localhost:3000", "https://example.com"]
    assert settings.CORS_ALLOW_HEADERS == ["Accept", "Content-Type"]
