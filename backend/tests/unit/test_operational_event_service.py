from unittest.mock import AsyncMock, MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.models.operational_event import OperationalEvent
from app.services.operational_event_service import (
    REDACTED_VALUE,
    record_event,
    sanitize_event_target_url,
    sanitize_event_details,
)


@pytest.mark.unit
def test_sanitize_event_details_redacts_secret_like_keys() -> None:
    sanitized = sanitize_event_details(
        {
            "Authorization": "Bearer token",
            "nested": {"api_key": "secret", "safe": "value"},
            "items": [{"cookie": "session=abc"}],
        }
    )

    assert sanitized["Authorization"] == REDACTED_VALUE
    assert sanitized["nested"]["api_key"] == REDACTED_VALUE
    assert sanitized["nested"]["safe"] == "value"
    assert sanitized["items"][0]["cookie"] == REDACTED_VALUE


@pytest.mark.unit
def test_sanitize_event_target_url_redacts_sensitive_query_values() -> None:
    sanitized = sanitize_event_target_url(
        "https://example.com/path?token=abc&api_key=secret&next=/ok"
    )

    assert sanitized == (
        "https://example.com/path?token=[redacted]&"
        "api_key=[redacted]&next=%2Fok"
    )


@pytest.mark.unit
def test_sanitize_event_target_url_removes_userinfo() -> None:
    sanitized = sanitize_event_target_url(
        "https://user:pass@example.com:8443/path?visible=1"
    )

    assert sanitized == "https://example.com:8443/path?visible=1"


@pytest.mark.unit
def test_sanitize_event_target_url_preserves_non_sensitive_url() -> None:
    sanitized = sanitize_event_target_url(
        "https://example.com/path?category=scan&sort=desc"
    )

    assert sanitized == "https://example.com/path?category=scan&sort=desc"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_record_event_adds_sanitized_operational_event() -> None:
    db = AsyncMock(spec=AsyncSession)
    db.add = MagicMock()
    db.flush = AsyncMock()
    scan_id = uuid4()

    event = await record_event(
        db,
        event_type="scan_service.batch_failed",
        status="retrying",
        user_id=1,
        target_url="https://user:pass@example.com?session=abc&visible=ok",
        scan_id=scan_id,
        retry_count=2,
        error_code="SCAN_SERVICE_BATCH_FAILED",
        message="x" * 800,
        details={"token": "secret", "batch": "heavy"},
    )

    assert isinstance(event, OperationalEvent)
    assert event.target_url == "https://example.com?session=[redacted]&visible=ok"
    assert event.scan_id == scan_id
    assert event.retry_count == 2
    assert event.details["token"] == REDACTED_VALUE
    assert event.details["batch"] == "heavy"
    assert len(event.message) <= 500
    db.add.assert_called_once_with(event)
    db.flush.assert_awaited_once()
