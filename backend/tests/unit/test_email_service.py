"""Unit tests for SMTP alert email delivery."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import AsyncMock
from uuid import uuid4

import aiosmtplib
import pytest

from app.models.alert_event import AlertEvent
from app.models.monitor import Monitor, MonitorStatus
from app.services import email_service


def _build_monitor() -> Monitor:
    return Monitor(
        id=uuid4(),
        user_id=1,
        display_name="Example Monitor",
        url="https://example.com",
        capabilities={},
        enabled_capabilities=["uptime_only"],
        interval_seconds=300,
        http_method="GET",
        expected_status_code=None,
        is_enabled=True,
        status=MonitorStatus.UP,
        tags=[],
    )


def _build_alert(severity: str = "critical") -> AlertEvent:
    return AlertEvent(
        id=uuid4(),
        monitor_id=uuid4(),
        capability="uptime_only",
        event_type="downtime",
        severity=severity,
        threshold_config={"consecutiveFailures": 3},
        actual_value="consecutiveFailures:3",
        message="Monitor is down",
        dispatched_channels=["sse"],
        suppressed=False,
        suppress_reason=None,
        created_at=datetime(2026, 3, 26, 12, 0, tzinfo=timezone.utc),
    )


@pytest.mark.asyncio
@pytest.mark.unit
async def test_send_alert_email_builds_html_with_severity_color(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send_mock = AsyncMock(return_value={})
    monkeypatch.setattr(email_service, "aiosmtplib", type("M", (), {"send": send_mock, "SMTPException": aiosmtplib.SMTPException}))
    monkeypatch.setattr(email_service.settings, "EMAIL_DISPATCH_ENABLED", True)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "smtp.example.com")

    sent = await email_service.send_alert_email(
        "alerts@example.com",
        _build_alert("critical"),
        _build_monitor(),
    )

    assert sent is True
    message = send_mock.await_args.args[0]
    html_part = message.get_payload()[1]
    assert "#dc2626" in html_part.get_payload(decode=True).decode("utf-8")


@pytest.mark.asyncio
@pytest.mark.unit
async def test_send_alert_email_returns_false_on_smtp_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send_mock = AsyncMock(side_effect=aiosmtplib.SMTPException("boom"))
    monkeypatch.setattr(email_service, "aiosmtplib", type("M", (), {"send": send_mock, "SMTPException": aiosmtplib.SMTPException}))
    monkeypatch.setattr(email_service.settings, "EMAIL_DISPATCH_ENABLED", True)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "smtp.example.com")

    sent = await email_service.send_alert_email(
        "alerts@example.com",
        _build_alert("warning"),
        _build_monitor(),
    )

    assert sent is False


@pytest.mark.asyncio
@pytest.mark.unit
async def test_send_alert_email_skipped_when_dispatch_disabled(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send_mock = AsyncMock(return_value={})
    monkeypatch.setattr(email_service, "aiosmtplib", type("M", (), {"send": send_mock, "SMTPException": aiosmtplib.SMTPException}))
    monkeypatch.setattr(email_service.settings, "EMAIL_DISPATCH_ENABLED", False)

    sent = await email_service.send_alert_email(
        "alerts@example.com",
        _build_alert("info"),
        _build_monitor(),
    )

    assert sent is False
    send_mock.assert_not_awaited()


@pytest.mark.asyncio
@pytest.mark.unit
async def test_send_test_email_raises_on_smtp_error(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    send_mock = AsyncMock(side_effect=aiosmtplib.SMTPException("auth failed"))
    monkeypatch.setattr(
        email_service,
        "aiosmtplib",
        type("M", (), {"send": send_mock, "SMTPException": aiosmtplib.SMTPException}),
    )
    monkeypatch.setattr(email_service.settings, "EMAIL_DISPATCH_ENABLED", True)
    monkeypatch.setattr(email_service.settings, "SMTP_HOST", "smtp.gmail.com")

    with pytest.raises(aiosmtplib.SMTPException, match="auth failed"):
        await email_service.send_test_email("test@example.com")
