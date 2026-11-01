"""Evidence and idempotency rules for projected scan risk observations."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert

from app.models.scan import ModuleStatus, ScanStatus
from app.services.finding_observation import (
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
def test_persistence_uses_scan_rule_conflict_key_and_skips_failed_evidence() -> None:
    scan = _scan(
        _module("ssl", {"bits": 2048, "valid_to": "Jan 1 2020 GMT"}),
        _module("headers", None, ModuleStatus.FAILED),
    )

    class _Session:
        def __init__(self) -> None:
            self.saved_keys: set[tuple[object, str]] = set()
            self.insert_sql: str | None = None
            self.rows: list[dict] = []

        def execute(self, statement: object) -> SimpleNamespace:
            if not isinstance(statement, Insert):
                return SimpleNamespace(scalar_one=lambda: scan)
            self.insert_sql = str(statement.compile(dialect=postgresql.dialect()))
            rows = statement._multi_values[0]
            inserted = 0
            for raw_row in rows:
                row = {getattr(key, "key", key): value for key, value in raw_row.items()}
                key = (row["scan_id"], row["rule_id"])
                if key not in self.saved_keys:
                    self.saved_keys.add(key)
                    self.rows.append(row)
                    inserted += 1
            return SimpleNamespace(rowcount=inserted)

    session = _Session()
    assert persist_finding_observations(session, scan.id) == 1
    assert persist_finding_observations(session, scan.id) == 0
    assert len(session.rows) == 1
    assert session.rows[0]["rule_id"] == "ssl.certificate_expiry"
    assert session.rows[0]["evidence_modules"] == ["ssl"]
    assert session.rows[0]["observed_at"] == scan.completed_at
    assert "ON CONFLICT ON CONSTRAINT uq_scan_finding_observation_scan_rule DO NOTHING" in session.insert_sql


@pytest.mark.unit
def test_persistence_does_not_write_noncompleted_scan() -> None:
    scan = _scan(_module("ssl", {"bits": 2048}), status=ScanStatus.FAILED)

    class _Session:
        def execute(self, statement: object) -> SimpleNamespace:
            assert not isinstance(statement, Insert)
            return SimpleNamespace(scalar_one=lambda: scan)

    assert persist_finding_observations(_Session(), scan.id) == 0
