"""GET/PUT /api/v1/me/notification-settings."""

from __future__ import annotations

import pytest
from httpx import AsyncClient


@pytest.mark.asyncio
@pytest.mark.integration
async def test_notification_settings_roundtrip(async_client: AsyncClient) -> None:
    r0 = await async_client.get("/api/v1/me/notification-settings")
    assert r0.status_code == 200
    body0 = r0.json()["data"]
    assert body0["webhookUrl"] is None
    assert body0["webhookEnabled"] is False
    assert body0["monitorEventsEnabled"] is True
    assert body0["emailEnabled"] is False
    assert body0["emailAddress"] is None
    assert body0["emailOnCritical"] is True
    assert body0["emailOnWarning"] is True
    assert body0["emailOnInfo"] is False

    r1 = await async_client.put(
        "/api/v1/me/notification-settings",
        json={
            "webhookUrl": "https://example.com/hook",
            "webhookEnabled": True,
            "monitorEventsEnabled": True,
            "emailEnabled": True,
            "emailAddress": "alerts@example.com",
            "emailOnCritical": True,
            "emailOnWarning": False,
            "emailOnInfo": True,
        },
    )
    assert r1.status_code == 200
    d1 = r1.json()["data"]
    assert d1["webhookUrl"] == "https://example.com/hook"
    assert d1["webhookEnabled"] is True
    assert d1["emailEnabled"] is True
    assert d1["emailAddress"] == "alerts@example.com"
    assert d1["emailOnWarning"] is False

    r2 = await async_client.get("/api/v1/me/notification-settings")
    assert r2.status_code == 200
    d2 = r2.json()["data"]
    assert d2["webhookUrl"] == "https://example.com/hook"
    assert d2["webhookEnabled"] is True
    assert d2["emailEnabled"] is True
    assert d2["emailAddress"] == "alerts@example.com"
    assert d2["emailOnCritical"] is True
    assert d2["emailOnWarning"] is False
    assert d2["emailOnInfo"] is True


@pytest.mark.asyncio
@pytest.mark.integration
async def test_notification_settings_invalid_email_returns_422(
    async_client: AsyncClient,
) -> None:
    response = await async_client.put(
        "/api/v1/me/notification-settings",
        json={
            "emailEnabled": True,
            "emailAddress": "invalid-email",
            "emailOnCritical": True,
            "emailOnWarning": True,
            "emailOnInfo": False,
        },
    )

    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_test_email_returns_disabled_when_smtp_off(
    async_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When EMAIL_DISPATCH_ENABLED is False, endpoint returns sent=False."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "EMAIL_DISPATCH_ENABLED", False)

    response = await async_client.post(
        "/api/v1/me/test-email",
        json={"emailAddress": "test@example.com"},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sent"] is False
    assert "disabled" in data["message"].lower()


@pytest.mark.asyncio
@pytest.mark.integration
async def test_test_email_returns_no_address_when_empty(
    async_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """When no email address is provided or saved, endpoint returns sent=False."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "EMAIL_DISPATCH_ENABLED", True)
    monkeypatch.setattr(settings, "SMTP_HOST", "smtp.example.com")

    response = await async_client.post(
        "/api/v1/me/test-email",
        json={"emailAddress": ""},
    )

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sent"] is False


@pytest.mark.asyncio
@pytest.mark.integration
async def test_notification_settings_channels_roundtrip(
    async_client: AsyncClient,
) -> None:
    """Phase 3 — Slack/Discord/Teams/PagerDuty config persists round-trip."""

    body = {
        "webhookUrl": None,
        "webhookEnabled": False,
        "monitorEventsEnabled": True,
        "emailEnabled": False,
        "emailAddress": None,
        "emailOnCritical": True,
        "emailOnWarning": True,
        "emailOnInfo": False,
        "channels": {
            "slack": {
                "enabled": True,
                "target": "https://hooks.slack.com/services/AAA/BBB/CCC",
                "severityFilter": ["critical", "warning"],
            },
            "discord": {
                "enabled": True,
                "target": "https://discord.com/api/webhooks/123456789012345678/abcdef",
                "severityFilter": ["critical"],
            },
            "teams": {
                "enabled": False,
                "target": None,
                "severityFilter": ["critical"],
            },
            "pagerduty": {
                "enabled": True,
                "target": "0123456789abcdef0123456789abcdef",
                "severityFilter": ["critical"],
            },
        },
    }
    r = await async_client.put("/api/v1/me/notification-settings", json=body)
    assert r.status_code == 200, r.text
    data = r.json()["data"]
    assert data["channels"]["slack"]["enabled"] is True
    assert data["channels"]["slack"]["target"].startswith("https://hooks.slack.com")
    assert data["channels"]["discord"]["enabled"] is True
    assert data["channels"]["pagerduty"]["target"] == "0123456789abcdef0123456789abcdef"
    assert data["channels"]["teams"]["enabled"] is False

    r2 = await async_client.get("/api/v1/me/notification-settings")
    assert r2.status_code == 200
    data2 = r2.json()["data"]
    assert data2["channels"]["slack"]["enabled"] is True
    assert data2["channels"]["pagerduty"]["enabled"] is True


@pytest.mark.asyncio
@pytest.mark.integration
async def test_notification_settings_invalid_slack_url_returns_422(
    async_client: AsyncClient,
) -> None:
    response = await async_client.put(
        "/api/v1/me/notification-settings",
        json={
            "channels": {
                "slack": {
                    "enabled": True,
                    "target": "https://example.com/not-slack",
                    "severityFilter": ["critical"],
                }
            }
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_notification_settings_invalid_pagerduty_key_returns_422(
    async_client: AsyncClient,
) -> None:
    response = await async_client.put(
        "/api/v1/me/notification-settings",
        json={
            "channels": {
                "pagerduty": {
                    "enabled": True,
                    "target": "not-a-valid-key",
                    "severityFilter": ["critical"],
                }
            }
        },
    )
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_test_notification_unknown_channel_returns_helpful_error(
    async_client: AsyncClient,
) -> None:
    response = await async_client.post(
        "/api/v1/me/notification-channels/test",
        json={"channel_id": "telegram"},
    )
    # The Pydantic Literal rejects unknown channel ids at schema-validation
    # time → 422.
    assert response.status_code == 422


@pytest.mark.asyncio
@pytest.mark.integration
async def test_test_notification_email_skipped_when_smtp_disabled(
    async_client: AsyncClient,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    """The email adapter returns a skipped (not failed) result when SMTP is
    disabled — the dispatch endpoint surfaces ``skipped_reason`` so the UI
    can explain why nothing left the server."""

    from app.core.config import settings

    monkeypatch.setattr(settings, "EMAIL_DISPATCH_ENABLED", False)
    response = await async_client.post(
        "/api/v1/me/notification-channels/test",
        json={"channel_id": "email"},
    )
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["channel_id"] == "email"
    assert data["skipped_reason"] == "disabled"
