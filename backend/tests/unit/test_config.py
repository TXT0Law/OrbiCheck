from __future__ import annotations

import base64

import pytest
from pydantic import ValidationError

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


def _set_valid_production_env(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("APP_ENV", "production")
    monkeypatch.setenv(
        "DATABASE_URL",
        "postgresql+asyncpg://orbicheck:strong-password@db.example.com/orbicheck",
    )
    monkeypatch.setenv("REDIS_URL", "rediss://redis.example.com:6379/0")
    monkeypatch.setenv("SCAN_SERVICE_URL", "http://scan-service:4000")
    monkeypatch.setenv("CORS_ORIGINS", '["https://orbicheck.example.com"]')
    monkeypatch.setenv("PUBLIC_BASE_URL", "https://orbicheck.example.com")
    monkeypatch.setenv("AUTH_LOGIN_PASSWORD", "a-strong-admin-password")
    monkeypatch.setenv("AUTH_SESSION_SECRET", "s" * 48)
    monkeypatch.setenv(
        "MONITOR_SECRET_ENCRYPTION_KEY",
        base64.urlsafe_b64encode(b"e" * 32).decode(),
    )
    monkeypatch.setenv("INTERNAL_SERVICE_SECRET", "i" * 48)
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "true")
    monkeypatch.setenv("AUTH_DEV_BYPASS_ENABLED", "false")


@pytest.mark.unit
def test_production_settings_accept_secure_complete_configuration(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_valid_production_env(monkeypatch)

    settings = Settings(_env_file=None)

    assert settings.APP_ENV == "production"
    assert settings.AUTH_COOKIE_SECURE is True


@pytest.mark.unit
def test_production_settings_reject_placeholder_and_insecure_cookie(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_valid_production_env(monkeypatch)
    monkeypatch.setenv("AUTH_LOGIN_PASSWORD", "change-me-before-production")
    monkeypatch.setenv("AUTH_COOKIE_SECURE", "false")

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    message = str(exc_info.value)
    assert "known placeholder" in message
    assert "AUTH_COOKIE_SECURE must be true" in message


@pytest.mark.unit
def test_production_settings_reject_missing_encryption_and_internal_secrets(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    _set_valid_production_env(monkeypatch)
    monkeypatch.setenv("MONITOR_SECRET_ENCRYPTION_KEY", "")
    monkeypatch.setenv("INTERNAL_SERVICE_SECRET", "")

    with pytest.raises(ValidationError) as exc_info:
        Settings(_env_file=None)

    message = str(exc_info.value)
    assert "MONITOR_SECRET_ENCRYPTION_KEY is required" in message
    assert "INTERNAL_SERVICE_SECRET is required" in message
