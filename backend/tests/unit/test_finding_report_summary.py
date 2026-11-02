"""Scheduled risk summaries preserve bounded evidence and unknown coverage."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.models.report_schedule import ReportScheduleCadence
from app.models.scan import Scan, ScanStatus
from app.services import finding_report_summary as summary_service
from app.services.finding_report_evidence import (
    ReportRiskModulesPage,
    ReportRiskObservation,
    ReportRiskObservationsPage,
)
from app.services.finding_report_period import ReportRiskPeriodScans, ReportRiskWindow

NOW = datetime(2026, 11, 2, tzinfo=timezone.utc)
DOMAIN = "example.com"
RULE_ID = "ssl.certificate_expiry"


def _scan(minute: int) -> Scan:
    completed_at = NOW + timedelta(minutes=minute)
    return Scan(
        id=uuid4(),
        user_id=7,
        domain=DOMAIN,
        url=f"https://{DOMAIN}",
        status=ScanStatus.COMPLETED,
        completed_at=completed_at,
        finding_observations_projected_at=completed_at,
        finding_ruleset_version=1,
    )


@pytest.mark.unit
def test_scheduled_summary_loads_predecessor_and_period_evidence(monkeypatch: pytest.MonkeyPatch) -> None:
    predecessor, current = _scan(-2), _scan(-1)
    window = ReportRiskWindow(NOW - timedelta(days=7), NOW)
    period = ReportRiskPeriodScans([current], has_more=False)
    observations = ReportRiskObservationsPage(
        [
            ReportRiskObservation(
                scan_id=current.id,
                rule_id=RULE_ID,
                ruleset_version=1,
                severity="high",
                evidence_modules=("ssl",),
            )
        ],
        has_more=False,
        oversized_evidence=False,
    )
    modules = ReportRiskModulesPage(
        {predecessor.id: frozenset({"ssl"}), current.id: frozenset({"ssl"})},
        has_more=False,
    )
    window_loader = MagicMock(return_value=window)
    scan_loader = MagicMock(return_value=period)
    predecessor_loader = MagicMock(return_value=predecessor)
    observation_loader = MagicMock(return_value=observations)
    module_loader = MagicMock(return_value=modules)
    monkeypatch.setattr(summary_service, "resolve_scheduled_report_risk_window", window_loader)
    monkeypatch.setattr(summary_service, "load_report_risk_period_scans", scan_loader)
    monkeypatch.setattr(summary_service, "load_report_risk_period_predecessor", predecessor_loader)
    monkeypatch.setattr(summary_service, "load_report_risk_observations", observation_loader)
    monkeypatch.setattr(summary_service, "load_report_risk_successful_modules", module_loader)
    db = MagicMock()
    schedule_id = uuid4()

    result = summary_service.load_scheduled_report_risk_summary(
        db,
        user_id=7,
        schedule_id=schedule_id,
        domain=DOMAIN,
        cadence=ReportScheduleCadence.WEEKLY,
        timezone_name="UTC",
        end_at=NOW,
    )

    assert result.window == window
    assert result.projection.scanned == 1
    assert result.changes.transitions[0].change == "new"
    assert result.changes.has_unknown_coverage is False
    window_loader.assert_called_once_with(
        db,
        user_id=7,
        schedule_id=schedule_id,
        domain=DOMAIN,
        cadence=ReportScheduleCadence.WEEKLY,
        timezone_name="UTC",
        end_at=NOW,
    )
    scan_loader.assert_called_once_with(
        db, user_id=7, domain=DOMAIN, start_at=window.start_at, end_at=window.end_at
    )
    predecessor_loader.assert_called_once_with(
        db, user_id=7, domain=DOMAIN, start_at=window.start_at
    )
    expected_ids = (predecessor.id, current.id)
    observation_loader.assert_called_once_with(
        db, user_id=7, domain=DOMAIN, scan_ids=expected_ids
    )
    module_loader.assert_called_once_with(
        db, user_id=7, domain=DOMAIN, scan_ids=expected_ids
    )


@pytest.mark.unit
def test_scheduled_summary_without_scans_keeps_unknown_and_skips_empty_evidence_query(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    window = ReportRiskWindow(NOW - timedelta(days=7), NOW)
    monkeypatch.setattr(
        summary_service, "resolve_scheduled_report_risk_window", lambda *args, **kwargs: window
    )
    monkeypatch.setattr(
        summary_service,
        "load_report_risk_period_scans",
        lambda *args, **kwargs: ReportRiskPeriodScans([], has_more=False),
    )
    monkeypatch.setattr(
        summary_service, "load_report_risk_period_predecessor", lambda *args, **kwargs: None
    )
    observations = MagicMock()
    modules = MagicMock()
    monkeypatch.setattr(summary_service, "load_report_risk_observations", observations)
    monkeypatch.setattr(summary_service, "load_report_risk_successful_modules", modules)

    result = summary_service.load_scheduled_report_risk_summary(
        MagicMock(),
        user_id=7,
        schedule_id=uuid4(),
        domain=DOMAIN,
        cadence=ReportScheduleCadence.WEEKLY,
        timezone_name="UTC",
        end_at=NOW,
    )

    assert result.projection.scanned == 0
    assert result.changes.transitions == ()
    assert result.changes.has_unknown_coverage is True
    observations.assert_not_called()
    modules.assert_not_called()
