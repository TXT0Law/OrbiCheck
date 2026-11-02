"""Report risk coverage stays owner-scoped, bounded, and explicit about gaps."""

from __future__ import annotations

from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models.scan import Scan, ScanStatus
from app.models.report_schedule import ReportScheduleCadence
from app.services.finding_report_period import (
    REPORT_RISK_PERIOD_SCAN_MAX_LIMIT,
    first_report_risk_window,
    load_report_risk_period_scans,
)

START = datetime(2026, 10, 1, tzinfo=timezone.utc)
END = datetime(2026, 11, 1, tzinfo=timezone.utc)
PAGE_LIMIT = 2


@pytest.mark.unit
def test_first_weekly_report_window_preserves_local_time_across_dst() -> None:
    window = first_report_risk_window(
        cadence=ReportScheduleCadence.WEEKLY,
        timezone_name="America/New_York",
        end_at=datetime(2026, 3, 10, 13, 0, tzinfo=timezone.utc),
    )

    assert window.start_at == datetime(2026, 3, 3, 14, 0, tzinfo=timezone.utc)
    assert window.end_at == datetime(2026, 3, 10, 13, 0, tzinfo=timezone.utc)


@pytest.mark.unit
def test_first_monthly_report_window_clamps_shorter_month_and_year() -> None:
    window = first_report_risk_window(
        cadence=ReportScheduleCadence.MONTHLY,
        timezone_name="UTC",
        end_at=datetime(2026, 3, 31, 10, 0, tzinfo=timezone.utc),
    )
    january_window = first_report_risk_window(
        cadence=ReportScheduleCadence.MONTHLY,
        timezone_name="UTC",
        end_at=datetime(2026, 1, 31, 10, 0, tzinfo=timezone.utc),
    )

    assert window.start_at == datetime(2026, 2, 28, 10, 0, tzinfo=timezone.utc)
    assert january_window.start_at == datetime(2025, 12, 31, 10, 0, tzinfo=timezone.utc)


@pytest.mark.unit
def test_first_report_window_rejects_naive_end_and_invalid_cadence() -> None:
    with pytest.raises(ValueError, match="timezone"):
        first_report_risk_window(
            cadence=ReportScheduleCadence.WEEKLY,
            timezone_name="UTC",
            end_at=datetime(2026, 3, 10),
        )
    with pytest.raises(ValueError, match="cadence"):
        first_report_risk_window(
            cadence="daily",  # type: ignore[arg-type]
            timezone_name="UTC",
            end_at=END,
        )


@pytest.mark.unit
def test_report_risk_period_is_bounded_and_keeps_unprojected_scans_visible() -> None:
    scans = [
        Scan(
            id=uuid4(), user_id=7, domain="example.com", url="https://example.com",
            status=ScanStatus.COMPLETED, completed_at=START,
            finding_observations_projected_at=None,
        )
        for _ in range(3)
    ]
    db = MagicMock()
    db.execute.return_value.scalars.return_value.all.return_value = scans

    page = load_report_risk_period_scans(
        db, user_id=7, domain="example.com", start_at=START, end_at=END, limit=PAGE_LIMIT
    )

    assert page.scans == scans[:2]
    assert page.scans[0].finding_observations_projected_at is None
    assert page.has_more is True
    query = db.execute.call_args.args[0]
    sql = str(query.compile(dialect=postgresql.dialect()))
    assert "scans.user_id =" in sql
    assert "scans.domain =" in sql
    assert "scans.status =" in sql
    assert "scans.completed_at >=" in sql
    assert "scans.completed_at <" in sql
    assert "ORDER BY scans.completed_at, scans.id" in sql
    assert PAGE_LIMIT + 1 in query.compile().params.values()


@pytest.mark.unit
@pytest.mark.parametrize(
    "change",
    [
        {"user_id": 0},
        {"domain": " "},
        {"domain": " example.com "},
        {"limit": 0},
        {"limit": REPORT_RISK_PERIOD_SCAN_MAX_LIMIT + 1},
        {"start_at": END},
        {"end_at": START},
        {"start_at": datetime(2026, 10, 1)},
    ],
)
def test_report_risk_period_rejects_invalid_boundary(change: dict) -> None:
    db = MagicMock()
    args = {"user_id": 7, "domain": "example.com", "start_at": START, "end_at": END}
    args.update(change)

    with pytest.raises(ValueError):
        load_report_risk_period_scans(db, **args)

    db.execute.assert_not_called()
