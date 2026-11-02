"""Report risk coverage stays owner-scoped, bounded, and explicit about gaps."""

from __future__ import annotations

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.models.scan import Scan, ScanStatus
from app.models.report_schedule import ReportScheduleCadence
from app.services.finding_report_period import (
    REPORT_RISK_PERIOD_SCAN_MAX_LIMIT,
    REPORT_RISK_PERIOD_PREDECESSOR_LIMIT,
    ReportRiskPeriodScans,
    first_report_risk_window,
    load_previous_delivered_report_boundary,
    load_report_risk_period_predecessor,
    load_report_risk_period_scans,
    resolve_scheduled_report_risk_window,
    summarize_report_risk_projection_coverage,
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
def test_previous_delivered_boundary_requires_explicit_reported_risk_period() -> None:
    db = MagicMock()
    schedule_id = uuid4()
    previous_content_time = datetime(2026, 10, 20, 9, 0, tzinfo=timezone.utc)
    db.scalar.return_value = "2026-10-20T11:00:00+02:00"

    boundary = load_previous_delivered_report_boundary(
        db, user_id=7, schedule_id=schedule_id, domain="example.com", end_at=END
    )

    assert boundary == previous_content_time
    query = db.scalar.call_args.args[0]
    compiled = query.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "SELECT (reports.report_meta" in sql
    assert "report_schedule_runs.report_id = reports.id" in sql
    assert "report_schedule_runs.schedule_id =" in sql
    assert "report_schedule_runs.status =" in sql
    assert "report_schedule_runs.completed_at <" in sql
    assert "reports.user_id =" in sql
    assert "reports.status =" in sql
    assert "reports.completed_at <" in sql
    assert "reports.report_meta ->>" in sql
    assert "riskPeriod" in compiled.params.values()
    assert "status" in compiled.params.values()
    assert "version" in compiled.params.values()
    assert "reported" in compiled.params.values()
    assert "ORDER BY reports.completed_at DESC, report_schedule_runs.id DESC" in sql
    assert schedule_id in compiled.params.values()
    assert "example.com" in compiled.params.values()
    assert 1 in compiled.params.values()


@pytest.mark.unit
def test_previous_delivered_boundary_returns_none_without_matching_run() -> None:
    db = MagicMock()
    db.scalar.return_value = None

    assert load_previous_delivered_report_boundary(
        db, user_id=7, schedule_id=uuid4(), domain="example.com", end_at=END
    ) is None


@pytest.mark.unit
@pytest.mark.parametrize(
    "raw_end",
    ["invalid", "2026-10-20T09:00:00", END.isoformat(), datetime(2026, 10, 20, tzinfo=timezone.utc)],
)
def test_previous_delivered_boundary_rejects_invalid_reported_end(raw_end: object) -> None:
    db = MagicMock()
    db.scalar.return_value = raw_end

    with pytest.raises(ValueError, match="invalid end"):
        load_previous_delivered_report_boundary(
            db, user_id=7, schedule_id=uuid4(), domain="example.com", end_at=END
        )


@pytest.mark.unit
@pytest.mark.parametrize(
    "change",
    [
        {"user_id": 0},
        {"schedule_id": "invalid"},
        {"domain": " "},
        {"domain": " example.com "},
        {"end_at": datetime(2026, 11, 1)},
    ],
)
def test_previous_delivered_boundary_rejects_invalid_scope(change: dict) -> None:
    db = MagicMock()
    args = {"user_id": 7, "schedule_id": uuid4(), "domain": "example.com", "end_at": END}
    args.update(change)

    with pytest.raises(ValueError):
        load_previous_delivered_report_boundary(db, **args)

    db.scalar.assert_not_called()


@pytest.mark.unit
def test_scheduled_report_window_starts_at_previous_reported_risk_end() -> None:
    db = MagicMock()
    db.scalar.return_value = "2026-10-02T09:00:00+00:00"
    schedule_id = uuid4()

    window = resolve_scheduled_report_risk_window(
        db,
        user_id=7,
        schedule_id=schedule_id,
        domain="example.com",
        cadence=ReportScheduleCadence.WEEKLY,
        timezone_name="UTC",
        end_at=END,
    )

    assert window.start_at == datetime(2026, 10, 2, 9, 0, tzinfo=timezone.utc)
    assert window.end_at == END
    query = db.scalar.call_args.args[0]
    assert schedule_id in query.compile().params.values()


@pytest.mark.unit
def test_scheduled_report_window_uses_local_lookback_without_delivery() -> None:
    db = MagicMock()
    db.scalar.return_value = None

    window = resolve_scheduled_report_risk_window(
        db,
        user_id=7,
        schedule_id=uuid4(),
        domain="example.com",
        cadence=ReportScheduleCadence.MONTHLY,
        timezone_name="UTC",
        end_at=datetime(2026, 3, 31, 10, 0, tzinfo=timezone.utc),
    )

    assert window.start_at == datetime(2026, 2, 28, 10, 0, tzinfo=timezone.utc)
    assert window.end_at == datetime(2026, 3, 31, 10, 0, tzinfo=timezone.utc)


@pytest.mark.unit
@pytest.mark.parametrize(
    "previous",
    ["2026-10-01T00:00:00", END.isoformat(), "2026-11-02T00:00:00+00:00"],
)
def test_scheduled_report_window_rejects_invalid_previous_boundary(
    previous: str,
) -> None:
    db = MagicMock()
    db.scalar.return_value = previous

    with pytest.raises(ValueError, match="invalid end"):
        resolve_scheduled_report_risk_window(
            db,
            user_id=7,
            schedule_id=uuid4(),
            domain="example.com",
            cadence=ReportScheduleCadence.WEEKLY,
            timezone_name="UTC",
            end_at=END,
        )


@pytest.mark.unit
def test_scheduled_report_window_rejects_invalid_end_before_query() -> None:
    db = MagicMock()

    with pytest.raises(ValueError, match="timezone"):
        resolve_scheduled_report_risk_window(
            db,
            user_id=7,
            schedule_id=uuid4(),
            domain="example.com",
            cadence=ReportScheduleCadence.WEEKLY,
            timezone_name="UTC",
            end_at=datetime(2026, 11, 1),
        )

    db.scalar.assert_not_called()


@pytest.mark.unit
def test_report_projection_coverage_keeps_missing_and_truncated_states() -> None:
    def scan(
        *,
        status: ScanStatus = ScanStatus.COMPLETED,
        completed_at: datetime | None = START,
        projected_at: datetime | None = None,
        failed_at: datetime | None = None,
        ruleset_version: int | None = None,
    ) -> Scan:
        return Scan(
            id=uuid4(), user_id=7, domain="example.com", url="https://example.com",
            status=status, completed_at=completed_at,
            finding_observations_projected_at=projected_at,
            finding_observations_projection_failed_at=failed_at,
            finding_ruleset_version=ruleset_version,
        )

    page = ReportRiskPeriodScans(
        scans=[
            scan(projected_at=START, ruleset_version=1),
            scan(),
            scan(projected_at=START, failed_at=START, ruleset_version=1),
            scan(projected_at=START),
            scan(projected_at=START, ruleset_version=0),
            scan(status=ScanStatus.FAILED),
            scan(completed_at=None),
        ],
        has_more=True,
    )

    coverage = summarize_report_risk_projection_coverage(page)

    assert coverage.scanned == 7
    assert coverage.projected == 1
    assert coverage.pending == 1
    assert coverage.failed == 1
    assert coverage.unusable_ruleset_version == 2
    assert coverage.unavailable == 2
    assert coverage.truncated is True


@pytest.mark.unit
def test_report_projection_coverage_empty_period_is_explicit() -> None:
    coverage = summarize_report_risk_projection_coverage(
        ReportRiskPeriodScans(scans=[], has_more=False)
    )

    assert coverage.scanned == 0
    assert coverage.projected == 0
    assert coverage.truncated is False


@pytest.mark.unit
def test_report_risk_period_is_bounded_and_keeps_uncertain_scans_visible() -> None:
    scans = [
        Scan(
            id=uuid4(), user_id=7, domain="example.com", url="https://example.com",
            status=ScanStatus.COMPLETED, completed_at=START,
            finding_observations_projected_at=None,
        )
        for _ in range(3)
    ]
    scans[1].status = ScanStatus.FAILED
    scans[2].status = ScanStatus.CANCELLED
    db = MagicMock()
    db.execute.return_value.scalars.return_value.all.return_value = scans

    page = load_report_risk_period_scans(
        db, user_id=7, domain="example.com", start_at=START, end_at=END, limit=PAGE_LIMIT
    )

    assert page.scans == scans[:2]
    assert page.scans[0].finding_observations_projected_at is None
    assert page.scans[1].status == ScanStatus.FAILED
    assert page.has_more is True
    query = db.execute.call_args.args[0]
    compiled = query.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "scans.user_id =" in sql
    assert "scans.domain =" in sql
    assert "scans.status IN" in sql
    assert {ScanStatus.COMPLETED, ScanStatus.FAILED, ScanStatus.CANCELLED} in [
        set(value) for value in compiled.params.values() if isinstance(value, (list, tuple))
    ]
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


@pytest.mark.unit
def test_report_predecessor_preserves_latest_uncertain_scan() -> None:
    scan = Scan(
        id=uuid4(), user_id=7, domain="example.com", url="https://example.com",
        status=ScanStatus.FAILED, completed_at=START - timedelta(minutes=1),
        finding_observations_projected_at=None,
    )
    db = MagicMock()
    db.scalar.return_value = scan

    result = load_report_risk_period_predecessor(
        db, user_id=7, domain="example.com", start_at=START
    )

    assert result is scan
    query = db.scalar.call_args.args[0]
    sql = str(query.compile(dialect=postgresql.dialect()))
    assert "scans.user_id =" in sql
    assert "scans.domain =" in sql
    assert "scans.completed_at IS NOT NULL" in sql
    assert "scans.completed_at <" in sql
    assert "scans.status =" not in sql
    assert "ORDER BY scans.completed_at DESC, scans.id DESC" in sql
    assert REPORT_RISK_PERIOD_PREDECESSOR_LIMIT in query.compile().params.values()


@pytest.mark.unit
def test_report_predecessor_returns_none_when_no_earlier_scan_exists() -> None:
    db = MagicMock()
    db.scalar.return_value = None

    assert load_report_risk_period_predecessor(
        db, user_id=7, domain="example.com", start_at=START
    ) is None


@pytest.mark.unit
@pytest.mark.parametrize(
    "change",
    [
        {"user_id": 0},
        {"domain": " "},
        {"domain": " example.com "},
        {"start_at": datetime(2026, 10, 1)},
    ],
)
def test_report_predecessor_rejects_invalid_scope(change: dict) -> None:
    db = MagicMock()
    args = {"user_id": 7, "domain": "example.com", "start_at": START}
    args.update(change)

    with pytest.raises(ValueError):
        load_report_risk_period_predecessor(db, **args)

    db.scalar.assert_not_called()
