"""Owner-scoped risk history query and coverage semantics."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.models.scan import ScanFindingObservation
from app.services.finding_observation import (
    SCAN_FINDING_HISTORY_MAX_LIMIT,
    SCAN_FINDING_HISTORY_MAX_OFFSET,
    list_scan_finding_history,
)


class _Result:
    def __init__(self, value) -> None:
        self.value = value

    def all(self):
        return self.value

    def scalar_one(self):
        return self.value

    def one(self):
        return self.value


class _Session:
    def __init__(self, rows, total: int, coverage: tuple[int, int]) -> None:
        self.results = iter((rows, total, coverage))
        self.statements = []

    async def execute(self, statement):
        self.statements.append(statement)
        return _Result(next(self.results))


@pytest.mark.unit
@pytest.mark.asyncio
async def test_history_scopes_all_queries_to_owner_and_domain_and_orders_page() -> None:
    scan_id = uuid4()
    observed_at = datetime.now(timezone.utc)
    observation = ScanFindingObservation(
        scan_id=scan_id,
        rule_id="ssl.certificate_expiry",
        observed_at=observed_at,
    )
    db = _Session([(observation, "example.com")], total=1, coverage=(2, 1))

    page = await list_scan_finding_history(
        db, user_id=7, limit=10, offset=5, domain="example.com", rule_id="ssl.certificate_expiry"
    )

    assert page.total == 1
    assert (page.pending_scans, page.failed_scans) == (2, 1)
    assert page.items[0].scan_id == scan_id
    assert page.items[0].domain == "example.com"
    assert page.items[0].observation is observation
    for statement in db.statements:
        sql = str(statement)
        assert "scans.user_id" in sql
        assert "scans.domain" in sql
        assert 7 in statement.compile().params.values()
        assert "example.com" in statement.compile().params.values()
    for statement in db.statements[:2]:
        sql = str(statement)
        assert "scan_finding_observations.rule_id" in sql
        assert "finding_observations_projected_at IS NOT NULL" in sql
        assert "finding_observations_projection_failed_at IS NULL" in sql
    page_sql = str(db.statements[0])
    assert "observed_at DESC" in page_sql
    assert "scan_id DESC" in page_sql
    assert "rule_id ASC" in page_sql
    assert 10 in db.statements[0].compile().params.values()
    assert 5 in db.statements[0].compile().params.values()
    coverage_sql = str(db.statements[2])
    assert "finding_observations_projected_at IS NULL" in coverage_sql
    assert "finding_observations_projection_failed_at IS NOT NULL" in coverage_sql
    assert "scan_finding_observations.rule_id" not in coverage_sql


@pytest.mark.unit
@pytest.mark.asyncio
@pytest.mark.parametrize(
    ("limit", "offset"),
    [(0, 0), (SCAN_FINDING_HISTORY_MAX_LIMIT + 1, 0), (1, -1), (1, SCAN_FINDING_HISTORY_MAX_OFFSET + 1)],
)
async def test_history_rejects_unbounded_pagination(limit: int, offset: int) -> None:
    with pytest.raises(ValueError):
        await list_scan_finding_history(_Session([], 0, (0, 0)), user_id=7, limit=limit, offset=offset)
