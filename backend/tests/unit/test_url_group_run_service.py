"""Unit tests for URL group run service."""

from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, ValidationError
from app.models.url_group import (
    UrlGroup,
    UrlGroupMember,
    UrlGroupRun,
    UrlGroupRunMember,
    UrlGroupRunMemberStatus,
    UrlGroupRunStatus,
)
from app.models.operational_event import OperationalEvent
from app.services import url_group_run_service


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_group_run_creates_member_rows() -> None:
    db = AsyncMock(spec=AsyncSession)
    group_id = uuid4()
    member = UrlGroupMember(
        id=uuid4(),
        group_id=group_id,
        url="https://example.com",
        sort_order=1,
    )
    group = UrlGroup(id=group_id, name="Group", members=[member])
    active_result = MagicMock()
    active_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=active_result)
    db.add = MagicMock()
    db.flush = AsyncMock()
    db.refresh = AsyncMock()

    with patch.object(url_group_run_service, "get_group", AsyncMock(return_value=group)):
        with patch.object(
            url_group_run_service,
            "_find_recent_completed_scan",
            AsyncMock(return_value=None),
        ):
            run = await url_group_run_service.create_group_run(
                group_id=group_id,
                db=db,
                user_id=1,
                concurrency_limit=2,
            )

    assert run.group_id == group_id
    assert run.total_members == 1
    assert run.queued_members == 1
    assert run.concurrency_limit == 2
    added_events = [
        call.args[0]
        for call in db.add.call_args_list
        if isinstance(call.args[0], OperationalEvent)
    ]
    assert {event.event_type for event in added_events} == {
        "url_group_run.started",
        "url_group_run.member_queued",
    }
    assert any(isinstance(call.args[0], UrlGroupRunMember) for call in db.add.call_args_list)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_group_run_rejects_empty_group() -> None:
    db = AsyncMock(spec=AsyncSession)
    group = UrlGroup(id=uuid4(), name="Empty", members=[])

    with patch.object(url_group_run_service, "get_group", AsyncMock(return_value=group)):
        with pytest.raises(ConflictError) as exc_info:
            await url_group_run_service.create_group_run(
                group_id=group.id,
                db=db,
                user_id=1,
            )

    assert exc_info.value.code == "GROUP_HAS_NO_MEMBERS"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_group_run_validates_concurrency_limit() -> None:
    db = AsyncMock(spec=AsyncSession)
    group = UrlGroup(
        id=uuid4(),
        name="Group",
        members=[UrlGroupMember(id=uuid4(), url="https://example.com")],
    )
    active_result = MagicMock()
    active_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=active_result)

    with patch.object(url_group_run_service, "get_group", AsyncMock(return_value=group)):
        with pytest.raises(ValidationError) as exc_info:
            await url_group_run_service.create_group_run(
                group_id=group.id,
                db=db,
                user_id=1,
                concurrency_limit=99,
            )

    assert exc_info.value.code == "INVALID_CONCURRENCY_LIMIT"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_cancel_group_run_marks_queued_members_cancelled() -> None:
    now = datetime.now(timezone.utc)
    group_id = uuid4()
    run = UrlGroupRun(
        id=uuid4(),
        group_id=group_id,
        status=UrlGroupRunStatus.RUNNING,
        total_members=1,
        queued_members=1,
        concurrency_limit=1,
        created_at=now,
    )
    run.members = [
        UrlGroupRunMember(
            id=uuid4(),
            run_id=run.id,
            group_member_id=uuid4(),
            url="https://example.com",
            status=UrlGroupRunMemberStatus.QUEUED,
            created_at=now,
        )
    ]
    db = AsyncMock(spec=AsyncSession)
    db.flush = AsyncMock()

    with patch.object(url_group_run_service, "get_group_run", AsyncMock(return_value=run)):
        with patch.object(
            url_group_run_service,
            "publish_progress_snapshot",
            AsyncMock(return_value=None),
        ):
            cancelled = await url_group_run_service.cancel_group_run(
                group_id=group_id,
                run_id=run.id,
                db=db,
                user_id=1,
            )

    assert cancelled.status == UrlGroupRunStatus.CANCELLED
    assert cancelled.cancelled_members == 1
    assert cancelled.members[0].status == UrlGroupRunMemberStatus.CANCELLED


@pytest.mark.unit
@pytest.mark.asyncio
async def test_cancel_group_run_marks_creating_member_without_scan_cancelled() -> None:
    now = datetime.now(timezone.utc)
    group_id = uuid4()
    run = UrlGroupRun(
        id=uuid4(),
        group_id=group_id,
        status=UrlGroupRunStatus.RUNNING,
        total_members=1,
        running_members=1,
        concurrency_limit=1,
        created_at=now,
    )
    run.members = [
        UrlGroupRunMember(
            id=uuid4(),
            run_id=run.id,
            group_member_id=uuid4(),
            url="https://example.com",
            scan_id=None,
            status=UrlGroupRunMemberStatus.CREATING_SCAN,
            created_at=now,
        )
    ]
    db = AsyncMock(spec=AsyncSession)
    db.flush = AsyncMock()

    with patch.object(url_group_run_service, "get_group_run", AsyncMock(return_value=run)):
        with patch.object(
            url_group_run_service,
            "publish_progress_snapshot",
            AsyncMock(return_value=None),
        ):
            cancelled = await url_group_run_service.cancel_group_run(
                group_id=group_id,
                run_id=run.id,
                db=db,
                user_id=1,
            )

    assert cancelled.status == UrlGroupRunStatus.CANCELLED
    assert cancelled.cancelled_members == 1
    assert cancelled.members[0].status == UrlGroupRunMemberStatus.CANCELLED


@pytest.mark.unit
@pytest.mark.asyncio
async def test_retry_failed_group_run_rejects_active_source_run() -> None:
    now = datetime.now(timezone.utc)
    group_id = uuid4()
    source_run = UrlGroupRun(
        id=uuid4(),
        group_id=group_id,
        status=UrlGroupRunStatus.RUNNING,
        total_members=1,
        failed_members=1,
        concurrency_limit=1,
        created_at=now,
    )
    source_run.members = [
        UrlGroupRunMember(
            id=uuid4(),
            run_id=source_run.id,
            group_member_id=uuid4(),
            url="https://example.com",
            status=UrlGroupRunMemberStatus.FAILED,
            created_at=now,
        )
    ]
    db = AsyncMock(spec=AsyncSession)

    with patch.object(
        url_group_run_service,
        "get_group_run",
        AsyncMock(return_value=source_run),
    ):
        with pytest.raises(ConflictError) as exc_info:
            await url_group_run_service.retry_failed_group_run(
                group_id=group_id,
                run_id=source_run.id,
                db=db,
                user_id=1,
            )

    assert exc_info.value.code == "GROUP_RUN_ACTIVE"
    db.execute.assert_not_called()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_retry_failed_group_run_rejects_when_another_run_is_active() -> None:
    now = datetime.now(timezone.utc)
    group_id = uuid4()
    source_run = UrlGroupRun(
        id=uuid4(),
        group_id=group_id,
        status=UrlGroupRunStatus.PARTIAL,
        total_members=1,
        failed_members=1,
        concurrency_limit=1,
        created_at=now,
    )
    source_run.members = [
        UrlGroupRunMember(
            id=uuid4(),
            run_id=source_run.id,
            group_member_id=uuid4(),
            url="https://example.com",
            status=UrlGroupRunMemberStatus.FAILED,
            created_at=now,
        )
    ]
    active_result = MagicMock()
    active_result.scalar_one_or_none.return_value = UrlGroupRun(
        id=uuid4(),
        group_id=group_id,
        status=UrlGroupRunStatus.RUNNING,
        concurrency_limit=1,
    )
    db = AsyncMock(spec=AsyncSession)
    db.execute = AsyncMock(return_value=active_result)

    with patch.object(
        url_group_run_service,
        "get_group_run",
        AsyncMock(return_value=source_run),
    ):
        with pytest.raises(ConflictError) as exc_info:
            await url_group_run_service.retry_failed_group_run(
                group_id=group_id,
                run_id=source_run.id,
                db=db,
                user_id=1,
            )

    assert exc_info.value.code == "GROUP_RUN_ACTIVE"


@pytest.mark.unit
def test_run_to_dict_includes_progress_and_member_status() -> None:
    now = datetime.now(timezone.utc)
    run = SimpleNamespace(
        id=uuid4(),
        group_id=uuid4(),
        user_id=1,
        status=UrlGroupRunStatus.PARTIAL,
        total_members=2,
        queued_members=0,
        running_members=0,
        completed_members=1,
        failed_members=1,
        cancelled_members=0,
        skipped_members=0,
        concurrency_limit=2,
        error_message=None,
        created_at=now,
        started_at=now,
        completed_at=now,
        members=[
            SimpleNamespace(
                id=uuid4(),
                group_member_id=uuid4(),
                url="https://example.com",
                scan_id=uuid4(),
                status=UrlGroupRunMemberStatus.FAILED,
                error_message="boom",
                created_at=now,
                started_at=now,
                completed_at=now,
            )
        ],
    )

    payload = url_group_run_service.run_to_dict(run)

    assert payload["progress"] == 100
    assert payload["members"][0]["status"] == UrlGroupRunMemberStatus.FAILED
    assert payload["members"][0]["error_message"] == "boom"
