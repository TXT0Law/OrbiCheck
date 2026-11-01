"""Persistence invariants for scan finding observations."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

import pytest
from sqlalchemy import CheckConstraint, UniqueConstraint

from app.models.scan import Scan, ScanFindingObservation, ScanStatus
from app.services.finding_identity import FINDING_RULESET_VERSION


@pytest.mark.unit
def test_observations_are_unique_per_scan_and_rule() -> None:
    table = ScanFindingObservation.__table__
    unique_keys = {
        tuple(column.name for column in constraint.columns)
        for constraint in table.constraints
        if isinstance(constraint, UniqueConstraint)
    }

    assert ("scan_id", "rule_id") in unique_keys
    assert any(
        isinstance(constraint, CheckConstraint)
        and "ruleset_version > 0" in str(constraint.sqltext)
        for constraint in table.constraints
    )


@pytest.mark.unit
def test_observation_ownership_and_deletion_follow_parent_scan() -> None:
    table = ScanFindingObservation.__table__
    scan_fk = next(iter(table.c.scan_id.foreign_keys))

    assert scan_fk.target_fullname == "scans.id"
    assert scan_fk.ondelete == "CASCADE"
    assert "user_id" not in table.c
    assert "domain" not in table.c

    scan = Scan(
        id=uuid4(),
        user_id=7,
        domain="example.com",
        url="https://example.com",
        status=ScanStatus.COMPLETED,
    )
    observation = ScanFindingObservation(
        rule_id="ssl.certificate_expiry",
        ruleset_version=FINDING_RULESET_VERSION,
        severity="critical",
        title="SSL certificate expired",
        description="The SSL certificate has expired.",
        evidence_modules=["ssl"],
        observed_at=datetime.now(timezone.utc),
    )
    scan.finding_observations.append(observation)

    assert observation.scan is scan


@pytest.mark.unit
def test_scan_projection_marker_distinguishes_clean_from_unprojected_history() -> None:
    column = Scan.__table__.c.finding_observations_projected_at
    failure_column = Scan.__table__.c.finding_observations_projection_failed_at
    version_column = Scan.__table__.c.finding_ruleset_version

    assert column.nullable
    assert column.type.timezone
    assert failure_column.nullable
    assert failure_column.type.timezone
    assert version_column.nullable
