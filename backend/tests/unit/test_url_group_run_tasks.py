"""Unit tests for URL group run task helpers."""

from datetime import datetime, timezone
from types import SimpleNamespace
from uuid import uuid4

import pytest

from app.models.scan import ScanStatus
from app.models.url_group import UrlGroupRunMemberStatus, UrlGroupRunStatus
from app.tasks import url_group_run_tasks


def _run_with_counts(
    *,
    status: UrlGroupRunStatus = UrlGroupRunStatus.RUNNING,
    total_members: int = 2,
    completed_members: int = 0,
    failed_members: int = 0,
    cancelled_members: int = 0,
    skipped_members: int = 0,
) -> SimpleNamespace:
    return SimpleNamespace(
        id=uuid4(),
        status=status,
        total_members=total_members,
        completed_members=completed_members,
        failed_members=failed_members,
        cancelled_members=cancelled_members,
        skipped_members=skipped_members,
        completed_at=None,
    )


@pytest.mark.unit
def test_finalize_preserves_cancelled_run_status() -> None:
    run = _run_with_counts(
        status=UrlGroupRunStatus.CANCELLED,
        completed_members=1,
        cancelled_members=1,
    )

    url_group_run_tasks._finalize_run_status(run)

    assert run.status == UrlGroupRunStatus.CANCELLED
    assert run.completed_at is not None


@pytest.mark.unit
def test_finalize_marks_mixed_cancelled_run_partial() -> None:
    run = _run_with_counts(
        completed_members=1,
        cancelled_members=1,
    )

    url_group_run_tasks._finalize_run_status(run)

    assert run.status == UrlGroupRunStatus.PARTIAL


@pytest.mark.unit
def test_finalize_marks_all_cancelled_run_cancelled() -> None:
    run = _run_with_counts(
        total_members=2,
        cancelled_members=2,
    )

    url_group_run_tasks._finalize_run_status(run)

    assert run.status == UrlGroupRunStatus.CANCELLED


@pytest.mark.unit
def test_mark_member_from_cancelled_scan() -> None:
    member = SimpleNamespace(status=None, error_message=None, completed_at=None)
    scan = SimpleNamespace(
        status=ScanStatus.CANCELLED,
        error_message=None,
        completed_at=datetime.now(timezone.utc),
    )

    url_group_run_tasks._mark_member_from_scan(member, scan)

    assert member.status == UrlGroupRunMemberStatus.CANCELLED


@pytest.mark.unit
def test_cancel_runnable_members_marks_scans_and_members_cancelled() -> None:
    member = SimpleNamespace(status=UrlGroupRunMemberStatus.RUNNING, completed_at=None)
    scan = SimpleNamespace(status=ScanStatus.PENDING, completed_at=None)

    url_group_run_tasks._cancel_runnable_members([(member, scan)])

    assert scan.status == ScanStatus.CANCELLED
    assert scan.completed_at is not None
    assert member.status == UrlGroupRunMemberStatus.CANCELLED
    assert member.completed_at is not None
