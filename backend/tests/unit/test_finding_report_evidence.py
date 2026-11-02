"""Report observation reads are scoped and bounded before classification."""

from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql

from app.services.finding_report_evidence import (
    REPORT_RISK_EVIDENCE_MAX_SCANS,
    REPORT_RISK_OBSERVATION_LIMIT,
    REPORT_RISK_OBSERVATION_MAX_MODULES,
    REPORT_RISK_MODULE_RESULT_LIMIT,
    load_report_risk_observations,
    load_report_risk_successful_modules,
)


@pytest.mark.unit
def test_report_observation_query_is_scoped_narrow_and_bounded() -> None:
    scan_id = uuid4()
    db = MagicMock()
    db.execute.return_value.all.return_value = [
        (scan_id, "ssl.expiry", 1, "high", ["ssl"], 1)
    ]

    page = load_report_risk_observations(
        db, user_id=7, domain="example.com", scan_ids=(scan_id,)
    )

    assert [
        (row.scan_id, row.rule_id, row.evidence_modules) for row in page.observations
    ] == [(scan_id, "ssl.expiry", ("ssl",))]
    assert page.has_more is False
    assert page.oversized_evidence is False
    query = db.execute.call_args.args[0]
    compiled = query.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "JOIN scans ON scans.id = scan_finding_observations.scan_id" in sql
    assert "scans.user_id =" in sql
    assert "scans.domain =" in sql
    assert "scans.id IN" in sql
    assert "cardinality(scan_finding_observations.evidence_modules)" in sql
    assert "scan_finding_observations.description" not in sql
    assert "raw_result" not in sql
    assert (
        "ORDER BY scan_finding_observations.scan_id, scan_finding_observations.rule_id"
        in sql
    )
    assert REPORT_RISK_OBSERVATION_LIMIT + 1 in compiled.params.values()
    assert REPORT_RISK_OBSERVATION_MAX_MODULES + 1 in compiled.params.values()


@pytest.mark.unit
def test_report_observation_page_marks_oversized_module_evidence() -> None:
    scan_id = uuid4()
    db = MagicMock()
    row = (
        scan_id,
        "ssl.expiry",
        1,
        "high",
        ["ssl"],
        REPORT_RISK_OBSERVATION_MAX_MODULES + 1,
    )
    db.execute.return_value.all.return_value = [row]

    page = load_report_risk_observations(
        db, user_id=7, domain="example.com", scan_ids=(scan_id,)
    )

    assert len(page.observations) == 1
    assert page.has_more is False
    assert page.oversized_evidence is True


@pytest.mark.unit
def test_report_observation_page_marks_row_truncation() -> None:
    scan_id = uuid4()
    db = MagicMock()
    row = (scan_id, "ssl.expiry", 1, "high", ["ssl"], 1)
    db.execute.return_value.all.return_value = [row] * (
        REPORT_RISK_OBSERVATION_LIMIT + 1
    )

    page = load_report_risk_observations(
        db, user_id=7, domain="example.com", scan_ids=(scan_id,)
    )

    assert len(page.observations) == REPORT_RISK_OBSERVATION_LIMIT
    assert page.has_more is True
    assert page.oversized_evidence is False


@pytest.mark.unit
@pytest.mark.parametrize(
    "change",
    [
        {"user_id": 0},
        {"domain": " "},
        {"domain": " example.com "},
        {"scan_ids": ()},
        {"scan_ids": (uuid4(),) * (REPORT_RISK_EVIDENCE_MAX_SCANS + 1)},
        {"scan_ids": (uuid4(),) * 2},
        {"scan_ids": (uuid4(), "invalid")},
    ],
)
def test_report_observation_read_rejects_invalid_scope(change: dict) -> None:
    db = MagicMock()
    args = {"user_id": 7, "domain": "example.com", "scan_ids": (uuid4(),)}
    args.update(change)

    with pytest.raises(ValueError):
        load_report_risk_observations(db, **args)
    db.execute.assert_not_called()


@pytest.mark.unit
def test_report_module_query_is_scoped_bounded_and_excludes_skip_evidence() -> None:
    scan_id = uuid4()
    db = MagicMock()
    db.execute.return_value.all.return_value = [
        (scan_id, "ssl"),
        (scan_id, "ssl"),
        (scan_id, "headers"),
    ]

    page = load_report_risk_successful_modules(
        db, user_id=7, domain="example.com", scan_ids=(scan_id,)
    )

    assert page.successful_modules == {scan_id: frozenset({"ssl", "headers"})}
    assert page.has_more is False
    query = db.execute.call_args.args[0]
    compiled = query.compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "JOIN scans ON scans.id = scan_module_results.scan_id" in sql
    assert "scans.user_id =" in sql
    assert "scans.domain =" in sql
    assert "scans.id IN" in sql
    assert "scan_module_results.status =" in sql
    assert "jsonb_typeof(scan_module_results.raw_result)" in sql
    assert "jsonb_typeof(scan_module_results.raw_result[" in sql
    assert "strpos(lower(" in sql
    assert (
        "ORDER BY scan_module_results.scan_id, scan_module_results.module_name" in sql
    )
    assert sql.startswith(
        "SELECT scan_module_results.scan_id, scan_module_results.module_name"
    )
    assert REPORT_RISK_MODULE_RESULT_LIMIT + 1 in compiled.params.values()
    for indicator in ("not configured", "api key not configured", "disabled"):
        assert indicator in compiled.params.values()


@pytest.mark.unit
def test_report_module_page_marks_truncation() -> None:
    scan_id = uuid4()
    db = MagicMock()
    db.execute.return_value.all.return_value = [(scan_id, "ssl")] * (
        REPORT_RISK_MODULE_RESULT_LIMIT + 1
    )

    page = load_report_risk_successful_modules(
        db, user_id=7, domain="example.com", scan_ids=(scan_id,)
    )

    assert page.successful_modules == {scan_id: frozenset({"ssl"})}
    assert page.has_more is True


@pytest.mark.unit
@pytest.mark.parametrize(
    "change",
    [
        {"user_id": 0},
        {"domain": " "},
        {"domain": " example.com "},
        {"scan_ids": ()},
        {"scan_ids": (uuid4(),) * (REPORT_RISK_EVIDENCE_MAX_SCANS + 1)},
        {"scan_ids": (uuid4(),) * 2},
        {"scan_ids": (uuid4(), "invalid")},
    ],
)
def test_report_module_read_rejects_invalid_scope(change: dict) -> None:
    db = MagicMock()
    args = {"user_id": 7, "domain": "example.com", "scan_ids": (uuid4(),)}
    args.update(change)

    with pytest.raises(ValueError):
        load_report_risk_successful_modules(db, **args)
    db.execute.assert_not_called()
