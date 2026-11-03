"""Evidence and idempotency rules for projected scan risk observations."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert, Update
from sqlalchemy.sql.selectable import Select

from app.models.scan import ModuleStatus, ScanStatus
from app.services.finding_identity import FINDING_RULESET_VERSION
from app.services.finding_observation import (
    FindingProjectionError,
    build_finding_observations,
    persist_finding_observations,
)


def _scan(
    *rows: SimpleNamespace,
    status: ScanStatus = ScanStatus.COMPLETED,
    completed_at: datetime | None = None,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        status=status,
        completed_at=completed_at or datetime.now(timezone.utc),
        module_results=list(rows),
        finding_observations_projected_at=None,
        finding_ruleset_version=None,
    )


def _module(
    name: str, raw: dict | None, status: ModuleStatus = ModuleStatus.SUCCESS
) -> SimpleNamespace:
    return SimpleNamespace(module_name=name, raw_result=raw, status=status)


@pytest.mark.unit
def test_projection_only_records_findings_with_successful_module_evidence() -> None:
    scan = _scan(
        _module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}),
        _module("headers", None, ModuleStatus.FAILED),
        _module("hsts", None, ModuleStatus.TIMEOUT),
    )

    observations = build_finding_observations(scan)

    assert [row.rule_id for row in observations] == ["ssl.certificate_expiry"]
    assert observations[0].evidence_modules == ("ssl",)
    assert observations[0].user_id == scan.user_id
    assert observations[0].domain == scan.domain
    assert observations[0].observed_at == scan.completed_at


@pytest.mark.unit
def test_projection_excludes_skipped_module_results() -> None:
    skipped = {"skipped": True, "data": {"note": "Skipped by user"}}
    scan = _scan(
        _module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}),
        _module("headers", skipped),
        _module("hsts", skipped),
        _module("dnssec", skipped),
        _module("firewall", skipped),
    )

    assert [row.rule_id for row in build_finding_observations(scan)] == [
        "ssl.certificate_expiry"
    ]


@pytest.mark.unit
def test_projection_attributes_only_sources_that_support_a_shared_finding() -> None:
    scan = _scan(
        _module("headers", {"X-Frame-Options": "DENY"}),
        _module("http-security", {"Content-Security-Policy": "default-src 'self'"}),
        _module("threats", {"safeBrowsing": {"unsafe": True}}),
        _module("block-lists", {"blocklists": [{"isBlocked": False}]}),
    )

    observations = {row.rule_id: row for row in build_finding_observations(scan)}

    assert observations["headers.missing_csp"].evidence_modules == ("headers",)
    assert observations["threats.listed"].evidence_modules == ("threats",)


@pytest.mark.unit
def test_projection_has_stable_scan_rule_idempotency_key() -> None:
    scan = _scan(_module("http-security", {}))

    first = build_finding_observations(scan)
    repeated = build_finding_observations(scan)

    assert first == repeated
    assert first
    assert all(row.evidence_modules == ("http-security",) for row in first)
    assert len({row.idempotency_key for row in first}) == len(first)
    assert all(key[0] == scan.id for key in (row.idempotency_key for row in first))


@pytest.mark.unit
def test_projection_skips_noncompleted_scans() -> None:
    scan = _scan(
        _module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}),
        status=ScanStatus.CANCELLED,
    )

    assert build_finding_observations(scan) == []


@pytest.mark.unit
def test_projection_rejects_completed_scan_without_completion_time() -> None:
    scan = _scan(_module("headers", {}))
    scan.completed_at = None

    with pytest.raises(ValueError, match="completed_at"):
        build_finding_observations(scan)


@pytest.mark.unit
def test_persistence_marks_zero_findings_and_repeated_projection_is_a_noop() -> None:
    scan = _scan()

    class SessionStub:
        def __init__(self) -> None:
            self.statements: list[object] = []

        def execute(self, statement: object) -> SimpleNamespace:
            self.statements.append(statement)
            if isinstance(statement, Select):
                return SimpleNamespace(scalar_one=lambda: scan)
            if isinstance(statement, Update):
                values = statement.compile().params
                scan.finding_observations_projected_at = values["finding_observations_projected_at"]
                scan.finding_ruleset_version = values["finding_ruleset_version"]
            return SimpleNamespace()

    db = SessionStub()
    assert persist_finding_observations(db, scan.id) == 0
    assert scan.finding_observations_projected_at is not None
    assert scan.finding_ruleset_version == FINDING_RULESET_VERSION
    assert persist_finding_observations(db, scan.id) == 0
    assert [type(statement) for statement in db.statements] == [Select, Update, Select]


@pytest.mark.unit
def test_persistence_inserts_evidence_once_under_scan_lock() -> None:
    scan = _scan(_module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}))

    class SessionStub:
        def __init__(self) -> None:
            self.inserted: list[dict] = []
            self.select_sql: str | None = None

        def execute(self, statement: object) -> SimpleNamespace:
            if isinstance(statement, Select):
                self.select_sql = str(statement.compile(dialect=postgresql.dialect()))
                return SimpleNamespace(scalar_one=lambda: scan)
            if isinstance(statement, Insert):
                self.inserted.extend(
                    {getattr(key, "key", key): value for key, value in row.items()}
                    for row in statement._multi_values[0]
                )
                return SimpleNamespace(rowcount=len(self.inserted))
            if isinstance(statement, Update):
                values = statement.compile().params
                scan.finding_observations_projected_at = values["finding_observations_projected_at"]
                scan.finding_ruleset_version = values["finding_ruleset_version"]
            return SimpleNamespace()

    db = SessionStub()
    assert persist_finding_observations(db, scan.id) == 1
    assert persist_finding_observations(db, scan.id) == 0
    assert len(db.inserted) == 1
    assert db.inserted[0]["rule_id"] == "ssl.certificate_expiry"
    assert db.inserted[0]["evidence_modules"] == ["ssl"]
    assert "FOR UPDATE OF scans" in db.select_sql


@pytest.mark.unit
def test_persistence_rejects_unknown_ruleset_without_overwriting_findings() -> None:
    scan = _scan(_module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}))
    scan.finding_observations_projected_at = datetime.now(timezone.utc)
    scan.finding_ruleset_version = FINDING_RULESET_VERSION - 1
    statements: list[object] = []

    class SessionStub:
        def execute(self, statement: object) -> SimpleNamespace:
            statements.append(statement)
            return SimpleNamespace(scalar_one=lambda: scan)

    with pytest.raises(FindingProjectionError, match="another ruleset"):
        persist_finding_observations(SessionStub(), scan.id)
    assert len(statements) == 1
    assert isinstance(statements[0], Select)


@pytest.mark.unit
def test_persistence_keeps_malformed_scan_unprojected() -> None:
    scan = _scan(_module("ssl", {"bits": 2048}))
    scan.completed_at = None
    statements: list[object] = []

    class SessionStub:
        def execute(self, statement: object) -> SimpleNamespace:
            statements.append(statement)
            return SimpleNamespace(scalar_one=lambda: scan)

    with pytest.raises(FindingProjectionError, match="cannot be projected"):
        persist_finding_observations(SessionStub(), scan.id)
    assert scan.finding_observations_projected_at is None
    assert len(statements) == 1
    assert isinstance(statements[0], Select)
