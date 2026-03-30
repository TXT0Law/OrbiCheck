"""Unit tests for url_group_service."""

from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch
from uuid import uuid4

import pytest
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.exceptions import ConflictError, NotFoundError
from app.models.url_group import UrlGroup, UrlGroupMember
from app.services import url_group_service
from app.utils import url_parser


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_group_success() -> None:
    db = AsyncMock(spec=AsyncSession)
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=exec_result)
    db.add = MagicMock()
    db.flush = AsyncMock()

    group = await url_group_service.create_group("My Group", db, "Desc")
    assert group.name == "My Group"
    assert group.description == "Desc"
    db.add.assert_called_once()
    db.flush.assert_called_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_group_duplicate_name_raises() -> None:
    db = AsyncMock(spec=AsyncSession)
    existing = UrlGroup(id=uuid4(), name="My Group", description=None)
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = existing
    db.execute = AsyncMock(return_value=exec_result)

    with pytest.raises(ConflictError) as exc_info:
        await url_group_service.create_group("My Group", db)
    assert exc_info.value.code == "GROUP_NAME_EXISTS"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_group_success() -> None:
    db = AsyncMock(spec=AsyncSession)
    group = UrlGroup(id=uuid4(), name="G", description=None)
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = group
    db.execute = AsyncMock(return_value=exec_result)

    result = await url_group_service.get_group(group.id, db)
    assert result.id == group.id
    assert result.name == "G"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_group_not_found_raises() -> None:
    db = AsyncMock(spec=AsyncSession)
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=exec_result)

    with pytest.raises(NotFoundError) as exc_info:
        await url_group_service.get_group(uuid4(), db)
    assert exc_info.value.code == "GROUP_NOT_FOUND"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_group_success() -> None:
    db = AsyncMock(spec=AsyncSession)
    group = UrlGroup(id=uuid4(), name="G", description=None)
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = group
    db.execute = AsyncMock(return_value=exec_result)
    db.delete = AsyncMock()
    db.flush = AsyncMock()

    await url_group_service.delete_group(group.id, db)
    db.delete.assert_called_once()
    db.flush.assert_called_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_add_member_success() -> None:
    db = AsyncMock(spec=AsyncSession)
    group_id = uuid4()
    group = UrlGroup(id=group_id, name="G", description=None)
    group.members = []

    dup_result = MagicMock()
    dup_result.scalar_one_or_none.return_value = None
    max_result = MagicMock()
    max_result.scalar_one.return_value = 0
    db.execute = AsyncMock(side_effect=[dup_result, max_result])
    db.add = MagicMock()
    db.flush = AsyncMock()

    async def mock_get_group(gid, dbs, include_members=False):
        return group

    with patch.object(url_group_service, "get_group", side_effect=mock_get_group):
        with patch.object(
            url_parser,
            "normalize_url",
            return_value="https://example.com",
        ):
            member = await url_group_service.add_member(
                group_id, "https://example.com", db
            )
    assert member.url == "https://example.com"
    db.add.assert_called_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_add_member_invalid_url_raises() -> None:
    db = AsyncMock(spec=AsyncSession)
    with patch.object(
        url_group_service, "normalize_url", return_value=""
    ):
        with pytest.raises(ValueError):
            await url_group_service.add_member(uuid4(), "invalid", db)


@pytest.mark.unit
@pytest.mark.asyncio
async def test_add_member_duplicate_url_raises() -> None:
    db = AsyncMock(spec=AsyncSession)
    group_id = uuid4()
    group = UrlGroup(id=group_id, name="G")
    group.members = [UrlGroupMember(url="https://example.com")]

    async def mock_get_group(gid, dbs, include_members=False):
        return group

    dup_result = MagicMock()
    dup_result.scalar_one_or_none.return_value = UrlGroupMember(
        id=uuid4(), group_id=group_id, url="https://example.com"
    )
    db.execute = AsyncMock(return_value=dup_result)

    with patch.object(
        url_group_service, "get_group", side_effect=mock_get_group
    ):
        with patch.object(
            url_parser,
            "normalize_url",
            return_value="https://example.com",
        ):
            with pytest.raises(ConflictError) as exc_info:
                await url_group_service.add_member(
                    group_id, "https://example.com", db
                )
    assert exc_info.value.code == "URL_ALREADY_IN_GROUP"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_remove_member_success() -> None:
    db = AsyncMock(spec=AsyncSession)
    group_id = uuid4()
    member_id = uuid4()
    member = UrlGroupMember(id=member_id, group_id=group_id, url="https://x.com")
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = member
    db.execute = AsyncMock(return_value=exec_result)
    db.delete = AsyncMock()
    db.flush = AsyncMock()

    await url_group_service.remove_member(group_id, member_id, db)
    db.delete.assert_called_once()


@pytest.mark.unit
@pytest.mark.asyncio
async def test_remove_member_not_found_raises() -> None:
    db = AsyncMock(spec=AsyncSession)
    exec_result = MagicMock()
    exec_result.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(return_value=exec_result)

    with pytest.raises(NotFoundError) as exc_info:
        await url_group_service.remove_member(uuid4(), uuid4(), db)
    assert exc_info.value.code == "MEMBER_NOT_FOUND"


@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_members_with_scan_status_with_and_without_scan() -> None:
    db = AsyncMock(spec=AsyncSession)
    group_id = uuid4()
    member1 = UrlGroupMember(
        id=uuid4(), group_id=group_id, url="https://a.com", sort_order=0
    )
    member2 = UrlGroupMember(
        id=uuid4(), group_id=group_id, url="https://b.com", sort_order=1
    )
    group = UrlGroup(id=group_id, name="G", members=[member1, member2])

    scan_a = SimpleNamespace(
        id=uuid4(),
        status=SimpleNamespace(value="completed"),
        security_score=50,
    )

    res1 = MagicMock()
    res1.scalar_one_or_none.return_value = scan_a
    res2 = MagicMock()
    res2.scalar_one_or_none.return_value = None
    db.execute = AsyncMock(side_effect=[res1, res2])

    async def mock_get_group(gid, dbs, include_members=False):
        return group

    with patch.object(
        url_group_service, "get_group", side_effect=mock_get_group
    ):
        out = await url_group_service.get_members_with_scan_status(
            group_id, db
        )

    assert len(out) == 2
    assert out[0]["url"] == "https://a.com"
    assert out[0]["scan_id"] is not None
    assert out[0]["status"] == "completed"
    assert out[0]["security_score"] == 50
    assert out[1]["url"] == "https://b.com"
    assert out[1]["scan_id"] is None
    assert out[1]["status"] == "incomplete"
    assert out[1]["security_score"] is None
