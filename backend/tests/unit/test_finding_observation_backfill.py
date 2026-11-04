"""Bounded, restartable projection of historical completed scans."""

from __future__ import annotations

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest
from sqlalchemy.dialects import postgresql
from sqlalchemy.sql.dml import Insert, Update
from sqlalchemy.sql.selectable import Select

from app.models.scan import ModuleStatus, Scan, ScanStatus
from app.services import finding_observation
from app.tasks import scan_tasks


@pytest.mark.unit
def test_backfill_page_selects_only_unprojected_completed_scans(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    scan_ids = [uuid4() for _ in range(finding_observation.SCAN_FINDING_BACKFILL_BATCH_SIZE + 1)]
    remaining = list(scan_ids)
    statements: list[object] = []

    class _Session:
        def execute(self, statement: object) -> SimpleNamespace:
            statements.append(statement)
            page = remaining[: finding_observation.SCAN_FINDING_BACKFILL_BATCH_SIZE]
            return SimpleNamespace(scalars=lambda: SimpleNamespace(all=lambda: page))

    def _project(_db: object, scan_id: object) -> int:
        remaining.remove(scan_id)
        return 1

    monkeypatch.setattr(finding_observation, "persist_finding_observations", _project)
    session = _Session()

    first = finding_observation.backfill_finding_observations_page(session)
    second = finding_observation.backfill_finding_observations_page(session)
    third = finding_observation.backfill_finding_observations_page(session)

    assert first.processed_scans == finding_observation.SCAN_FINDING_BACKFILL_BATCH_SIZE
    assert first.inserted_observations == first.processed_scans
    assert second.processed_scans == 1
    assert third.processed_scans == 0
    compiled = statements[0].compile(dialect=postgresql.dialect())
    sql = str(compiled)
    assert "scans.status" in sql
    assert "scans.completed_at IS NOT NULL" in sql
    assert "scans.finding_observations_projected_at IS NULL" in sql
    assert "scans.finding_observations_projection_failed_at IS NULL" in sql
    assert "ORDER BY scans.id" in sql
    assert "LIMIT" in sql
    assert ScanStatus.COMPLETED in compiled.params.values()
    assert finding_observation.SCAN_FINDING_BACKFILL_BATCH_SIZE in compiled.params.values()


@pytest.mark.unit
def test_backfill_isolates_malformed_evidence_without_marking_it_projected(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    malformed_id = uuid4()
    valid_id = uuid4()
    malformed_scan = SimpleNamespace(
        id=malformed_id,
        user_id=7,
        domain="example.com",
        status=ScanStatus.COMPLETED,
        completed_at=datetime.now(timezone.utc),
        finding_observations_projected_at=None,
        finding_ruleset_version=None,
        module_results=[
            SimpleNamespace(
                module_name="ssl",
                status=ModuleStatus.SUCCESS,
                raw_result={"bits": "invalid", "valid_to": "Jan 1 2020 GMT"},
            )
        ],
    )
    valid_scan = SimpleNamespace(
        id=valid_id,
        user_id=7,
        domain="example.com",
        status=ScanStatus.COMPLETED,
        completed_at=datetime.now(timezone.utc),
        finding_observations_projected_at=None,
        finding_ruleset_version=None,
        module_results=[
            SimpleNamespace(
                module_name="ssl",
                status=ModuleStatus.SUCCESS,
                raw_result={"bits": 2048, "valid_to": "Jan 1 2020 GMT"},
            )
        ],
    )
    statements: list[object] = []

    class _Session:
        def execute(self, statement: object) -> SimpleNamespace:
            statements.append(statement)
            if isinstance(statement, Select) and len(statement.selected_columns) == 1:
                return SimpleNamespace(
                    scalars=lambda: SimpleNamespace(all=lambda: [malformed_id, valid_id])
                )
            if isinstance(statement, Select):
                scan_id = next(
                    value
                    for value in statement.compile(dialect=postgresql.dialect()).params.values()
                    if value in (malformed_id, valid_id)
                )
                scan = malformed_scan if scan_id == malformed_id else valid_scan
                return SimpleNamespace(scalar_one=lambda: scan)
            return SimpleNamespace(rowcount=1)

    original_build = finding_observation.build_finding_observations

    def fail_malformed_projection(
        scan: SimpleNamespace,
    ) -> list[finding_observation.FindingObservationCandidate]:
        if scan.id == malformed_id:
            raise ValueError("Malformed evidence cannot be projected")
        return original_build(scan)

    monkeypatch.setattr(finding_observation, "build_finding_observations", fail_malformed_projection)
    page = finding_observation.backfill_finding_observations_page(_Session())

    assert page.processed_scans == 2
    assert page.inserted_observations == 1
    assert page.failed_scans == 1
    assert sum(isinstance(statement, Insert) for statement in statements) == 1
    updates = [statement for statement in statements if isinstance(statement, Update)]
    assert len(updates) == 2
    failed_update_sql = str(updates[0].compile(dialect=postgresql.dialect()))
    projected_update_sql = str(updates[1].compile(dialect=postgresql.dialect()))
    assert "finding_observations_projection_failed_at" in failed_update_sql
    assert "finding_observations_projected_at" not in failed_update_sql
    assert "finding_observations_projected_at" in projected_update_sql


@pytest.mark.unit
def test_backfill_page_rejects_unbounded_work() -> None:
    class _Session:
        def execute(self, statement: object) -> None:
            raise AssertionError("Invalid limit must be rejected before querying")

    for limit in (0, finding_observation.SCAN_FINDING_BACKFILL_MAX_BATCH_SIZE + 1):
        with pytest.raises(ValueError, match="limit"):
            finding_observation.backfill_finding_observations_page(_Session(), limit)


@pytest.mark.unit
def test_backfill_task_commits_one_page(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    class _Session:
        def __init__(self) -> None:
            self.commits = 0

        def __enter__(self) -> "_Session":
            return self

        def __exit__(self, *_args: object) -> None:
            return None

        def commit(self) -> None:
            self.commits += 1

    session = _Session()
    monkeypatch.setattr(scan_tasks, "_get_sync_session", lambda: session)
    monkeypatch.setattr(
        scan_tasks,
        "backfill_finding_observations_page",
        lambda _db: finding_observation.FindingBackfillPage(2, 3, 1),
    )

    result = scan_tasks.backfill_scan_finding_observations.run()

    assert result == {"processedScans": 2, "insertedObservations": 3, "failedScans": 1}
    assert session.commits == 1
    assert scan_tasks.backfill_scan_finding_observations.name == (
        "app.tasks.scan_tasks.backfill_scan_finding_observations"
    )


@pytest.mark.unit
def test_backfill_index_matches_projection_query() -> None:
    index = next(
        item for item in Scan.__table__.indexes if item.name == "ix_scans_finding_backfill"
    )

    assert [column.name for column in index.columns] == [
        "status",
        "finding_observations_projected_at",
        "id",
    ]
