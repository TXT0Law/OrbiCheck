"""Phase 3 — per-channel adapter tests.

Each test uses ``respx`` to assert the outbound JSON payload shape matches
the integration's documented contract (Slack Block Kit, Discord embeds,
Teams MessageCard, PagerDuty Events v2). Failures must surface as
``ChannelDispatchResult.success=False`` with an error string the retry
queue can store — never raise out of the adapter.
"""

from __future__ import annotations

from datetime import datetime, timezone

import httpx
import pytest
import respx

from app.services.notification_channels import (
    AlertPayload,
    ChannelConfig,
    PagerDutyEventAction,
)
from app.services.notification_channels._helpers import render_alert_title
from app.services.notification_channels.discord import DiscordChannel, validate_target_url as validate_discord
from app.services.notification_channels.pagerduty import (
    PagerDutyChannel,
    build_event_payload,
    severity_for_pagerduty,
    validate_integration_key,
)
from app.services.notification_channels.slack import (
    SlackChannel,
    validate_target_url as validate_slack,
)
from app.services.notification_channels.teams import (
    TeamsChannel,
    validate_target_url as validate_teams,
)
from app.services.notification_channels.webhook import WebhookChannel


def _payload(**overrides) -> AlertPayload:
    base = {
        "monitor_id": "11111111-1111-1111-1111-111111111111",
        "monitor_name": "Production API",
        "monitor_url": "https://example.com",
        "capability": "uptime_only",
        "event_type": "alert_event",
        "severity": "critical",
        "message": "Monitor is down",
        "actual_value": "consecutiveFailures:3",
        "threshold_config": {"consecutiveFailures": 3},
        "alert_id": "22222222-2222-2222-2222-222222222222",
        "created_at": datetime(2026, 4, 28, 9, 0, tzinfo=timezone.utc),
        "dedup_key": "monitor:11111111-1111-1111-1111-111111111111:uptime_only",
        "monitor_url_dashboard": "https://orbicheck.app/dashboard/monitor/11111111-1111-1111-1111-111111111111",
    }
    base.update(overrides)
    return AlertPayload(**base)


# ── URL / key validators ──────────────────────────────────────────────


@pytest.mark.unit
def test_slack_url_validation_rejects_non_slack_host() -> None:
    with pytest.raises(ValueError):
        validate_slack("https://example.com/hook")
    assert validate_slack(
        "https://hooks.slack.com/services/T0000/B0000/abcdef"
    ) == "https://hooks.slack.com/services/T0000/B0000/abcdef"


@pytest.mark.unit
def test_discord_url_validation_requires_webhook_path() -> None:
    with pytest.raises(ValueError):
        validate_discord("https://discord.com/")
    assert (
        validate_discord(
            "https://discord.com/api/webhooks/123/abc"
        )
        == "https://discord.com/api/webhooks/123/abc"
    )


@pytest.mark.unit
def test_teams_url_validation_only_accepts_office_subdomain() -> None:
    with pytest.raises(ValueError):
        validate_teams("https://hooks.example.com/x")
    assert (
        validate_teams(
            "https://example.webhook.office.com/webhookb2/abc"
        )
        == "https://example.webhook.office.com/webhookb2/abc"
    )


@pytest.mark.unit
def test_pagerduty_integration_key_pattern() -> None:
    with pytest.raises(ValueError):
        validate_integration_key("short")
    valid = "abcdef0123456789abcdef0123456789"
    assert validate_integration_key(valid) == valid


@pytest.mark.unit
def test_pagerduty_severity_mapping() -> None:
    assert severity_for_pagerduty("critical") == "critical"
    assert severity_for_pagerduty("warning") == "warning"
    assert severity_for_pagerduty("info") == "info"
    assert severity_for_pagerduty("unknown") == "info"


# ── Slack channel ─────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.unit
async def test_slack_channel_posts_block_kit_payload() -> None:
    channel = SlackChannel()
    config = ChannelConfig(
        enabled=True,
        target="https://hooks.slack.com/services/T0/B0/abcdef",
        severity_filter=["critical", "warning"],
    )
    payload = _payload()
    with respx.mock(base_url="https://hooks.slack.com") as router:
        route = router.post("/services/T0/B0/abcdef").respond(200, text="ok")
        result = await channel.send(payload, config)

    assert result.success is True
    assert route.called
    body = route.calls.last.request.read().decode()
    assert "Production API" in body
    assert "Monitor is down" in body
    assert "Open Monitor" in body
    assert '"type": "header"' in body or '"type":"header"' in body


@pytest.mark.asyncio
@pytest.mark.unit
async def test_slack_channel_returns_failure_on_http_500() -> None:
    channel = SlackChannel()
    config = ChannelConfig(
        enabled=True,
        target="https://hooks.slack.com/services/T0/B0/abcdef",
        severity_filter=["critical"],
    )
    with respx.mock(base_url="https://hooks.slack.com") as router:
        router.post("/services/T0/B0/abcdef").respond(500)
        result = await channel.send(_payload(), config)

    assert result.success is False
    assert result.error and "slack_http_status_500" in result.error


# ── Discord channel ───────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.unit
async def test_discord_channel_posts_embed_payload() -> None:
    channel = DiscordChannel()
    config = ChannelConfig(
        enabled=True,
        target="https://discord.com/api/webhooks/123/abc",
        severity_filter=["critical"],
    )
    with respx.mock(base_url="https://discord.com") as router:
        route = router.post("/api/webhooks/123/abc").respond(204)
        result = await channel.send(_payload(), config)

    assert result.success is True
    body = route.calls.last.request.read().decode()
    assert "OrbiCheck" in body
    assert "embeds" in body
    assert "Production API" in body


@pytest.mark.asyncio
@pytest.mark.unit
async def test_discord_channel_skips_when_no_target() -> None:
    channel = DiscordChannel()
    config = ChannelConfig(
        enabled=True, target=None, severity_filter=["critical"]
    )
    result = await channel.send(_payload(), config)
    assert result.success is True
    assert result.skipped_reason == "no_target"


# ── Teams channel ─────────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.unit
async def test_teams_channel_posts_message_card() -> None:
    channel = TeamsChannel()
    config = ChannelConfig(
        enabled=True,
        target="https://example.webhook.office.com/webhookb2/abc",
        severity_filter=["critical"],
    )
    with respx.mock(base_url="https://example.webhook.office.com") as router:
        route = router.post("/webhookb2/abc").respond(200, text="1")
        result = await channel.send(_payload(), config)

    assert result.success is True
    body = route.calls.last.request.read().decode()
    assert "MessageCard" in body
    assert "Production API" in body
    assert "OpenUri" in body


# ── PagerDuty channel ─────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.unit
async def test_pagerduty_channel_sends_trigger_event() -> None:
    channel = PagerDutyChannel()
    config = ChannelConfig(
        enabled=True,
        target="abcdef0123456789abcdef0123456789",
        severity_filter=["critical"],
    )
    with respx.mock(base_url="https://events.pagerduty.com") as router:
        route = router.post("/v2/enqueue").respond(202, json={"status": "success"})
        result = await channel.send(_payload(), config)

    assert result.success is True
    assert route.called
    body = route.calls.last.request.read().decode()
    assert '"event_action"' in body
    assert '"trigger"' in body
    assert '"dedup_key"' in body
    assert "monitor:11111111-1111-1111-1111-111111111111:uptime_only" in body


@pytest.mark.asyncio
@pytest.mark.unit
async def test_pagerduty_channel_resolve_event_omits_payload_section() -> None:
    """The resolve event must reuse the dedup_key but not include a `payload`."""

    payload = _payload(
        pagerduty_event_action=PagerDutyEventAction.RESOLVE,
        message="Monitor recovered",
        severity="info",
    )
    channel = PagerDutyChannel()
    config = ChannelConfig(
        enabled=True,
        target="abcdef0123456789abcdef0123456789",
        severity_filter=["critical"],
    )
    with respx.mock(base_url="https://events.pagerduty.com") as router:
        route = router.post("/v2/enqueue").respond(202, json={"status": "success"})
        result = await channel.send(payload, config)

    assert result.success is True
    body = route.calls.last.request.read().decode()
    assert '"event_action"' in body
    assert '"resolve"' in body
    # Resolve events for the Events API v2 do not require a `payload` block.
    assert '"payload"' not in body


@pytest.mark.unit
def test_pagerduty_resolve_dedup_key_matches_trigger() -> None:
    trigger = build_event_payload(
        _payload(),
        integration_key="abcdef0123456789abcdef0123456789",
    )
    resolve = build_event_payload(
        _payload(pagerduty_event_action=PagerDutyEventAction.RESOLVE),
        integration_key="abcdef0123456789abcdef0123456789",
    )
    assert trigger["dedup_key"] == resolve["dedup_key"]
    assert trigger["event_action"] == "trigger"
    assert resolve["event_action"] == "resolve"


@pytest.mark.unit
def test_pagerduty_is_enabled_always_true_for_resolve() -> None:
    """``resolve`` events bypass the severity filter — see channel docstring."""

    channel = PagerDutyChannel()
    config = ChannelConfig(
        enabled=True,
        target="abcdef0123456789abcdef0123456789",
        severity_filter=["critical"],  # excludes "info"
    )
    payload_resolve = _payload(
        severity="info",
        pagerduty_event_action=PagerDutyEventAction.RESOLVE,
    )
    payload_trigger_info = _payload(
        severity="info",
        pagerduty_event_action=PagerDutyEventAction.TRIGGER,
    )
    assert channel.is_enabled(config, payload_resolve) is True
    assert channel.is_enabled(config, payload_trigger_info) is False


@pytest.mark.unit
def test_content_restock_alert_title_is_specific() -> None:
    payload = _payload(
        capability="content_change",
        event_type="content_restock",
        message="Item appears back in stock",
        severity="warning",
    )
    assert render_alert_title(payload) == "Item back in stock — Production API"


# ── Webhook channel ───────────────────────────────────────────────────


@pytest.mark.asyncio
@pytest.mark.unit
async def test_webhook_channel_returns_failure_on_http_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    channel = WebhookChannel()
    config = ChannelConfig(
        enabled=True,
        target="https://example.com/hook",
        severity_filter=["critical"],
    )
    with respx.mock(base_url="https://example.com") as router:
        router.post("/hook").mock(side_effect=httpx.ConnectError("boom"))
        result = await channel.send(_payload(), config)

    assert result.success is False
    assert result.error and "webhook_http_error" in result.error
