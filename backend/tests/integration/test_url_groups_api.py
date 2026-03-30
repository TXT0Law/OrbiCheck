"""Integration tests for URL Groups API."""

from datetime import datetime, timezone
from uuid import uuid4

import pytest

from app.core.exceptions import ConflictError, NotFoundError
from app.services import url_group_service


@pytest.mark.asyncio
@pytest.mark.integration
async def test_create_group_201(async_client, monkeypatch) -> None:
    """Create group returns 201."""
    created_id = uuid4()
    created_at = updated_at = datetime.now(timezone.utc)

    async def _fake_create_group(name, db, description=None):
        g = type("G", (), {
            "id": created_id,
            "name": name,
            "description": description,
            "created_at": created_at,
            "updated_at": updated_at,
        })()
        return g

    async def _fake_get_member_count(g, db):
        return 0

    monkeypatch.setattr(url_group_service, "create_group", _fake_create_group)
    monkeypatch.setattr(url_group_service, "get_member_count", _fake_get_member_count)

    response = await async_client.post(
        "/api/v1/url-groups",
        json={"name": "Test Group", "description": "A test"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["name"] == "Test Group"
    assert data["data"]["description"] == "A test"
    assert data["data"]["memberCount"] == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_list_groups_200(async_client, monkeypatch) -> None:
    """List groups returns 200 with groups array."""
    gid = uuid4()
    now = datetime.now(timezone.utc)

    class FakeGroup:
        id = gid
        name = "My Group"
        description = "Desc"
        created_at = now
        updated_at = now

    async def _fake_list_groups(db, skip=0, limit=50):
        return [(FakeGroup(), 2)], 1

    monkeypatch.setattr(url_group_service, "list_groups", _fake_list_groups)

    response = await async_client.get("/api/v1/url-groups?skip=0&limit=10")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["total"] == 1
    assert len(data["data"]["groups"]) == 1
    assert data["data"]["groups"][0]["name"] == "My Group"
    assert data["data"]["groups"][0]["memberCount"] == 2


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_group_detail_200_members_empty(async_client, monkeypatch) -> None:
    """Get group detail returns 200 with empty members."""
    gid = uuid4()
    now = datetime.now(timezone.utc)

    class FakeGroup:
        id = gid
        name = "G"
        description = None
        created_at = now
        updated_at = now

    async def _fake_get_group(gid_in, db, include_members=False):
        return FakeGroup()

    async def _fake_get_members(gid_in, db):
        return []

    monkeypatch.setattr(url_group_service, "get_group", _fake_get_group)
    monkeypatch.setattr(
        url_group_service, "get_members_with_scan_status", _fake_get_members
    )

    response = await async_client.get(f"/api/v1/url-groups/{gid}")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["members"] == []
    assert data["data"]["memberCount"] == 0


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_member_201_url_normalized(async_client, monkeypatch) -> None:
    """Add member returns 201, URL is normalized."""
    gid = uuid4()
    mid = uuid4()
    now = datetime.now(timezone.utc)

    async def _fake_get_group(gid_in, db, include_members=False):
        class G:
            id = gid
            members = []
        return G()

    async def _fake_add_member(group_id, url, db, display_label=None):
        m = type("M", (), {
            "id": mid,
            "url": "https://example.com",
            "display_label": display_label,
            "sort_order": 0,
            "created_at": now,
        })()
        return m

    async def _fake_get_member_count(g, db):
        return 0

    monkeypatch.setattr(url_group_service, "get_group", _fake_get_group)
    monkeypatch.setattr(url_group_service, "add_member", _fake_add_member)
    monkeypatch.setattr(url_group_service, "get_member_count", _fake_get_member_count)

    response = await async_client.post(
        f"/api/v1/url-groups/{gid}/members",
        json={"url": "EXAMPLE.COM/", "displayLabel": "Example"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["status"] == "success"
    assert data["data"]["url"] == "https://example.com"
    assert data["data"]["status"] == "incomplete"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_add_duplicate_member_409(async_client, monkeypatch) -> None:
    """Add duplicate member returns 409."""
    gid = uuid4()

    async def _fake_add_member(group_id, url, db, display_label=None):
        raise ConflictError(
            code="URL_ALREADY_IN_GROUP",
            message="URL already in group",
        )

    monkeypatch.setattr(url_group_service, "add_member", _fake_add_member)

    response = await async_client.post(
        f"/api/v1/url-groups/{gid}/members",
        json={"url": "https://example.com"},
    )
    assert response.status_code == 409
    data = response.json()
    assert data["status"] == "error"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_members_incomplete_status(async_client, monkeypatch) -> None:
    """Get members returns incomplete for members without scan."""
    gid = uuid4()
    mid = uuid4()
    now = datetime.now(timezone.utc)

    async def _fake_get_group(gid_in, db, include_members=False):
        class G:
            id = gid
            members = []
        return G()

    async def _fake_get_members(gid_in, db):
        return [{
            "id": str(mid),
            "url": "https://example.com",
            "display_label": None,
            "sort_order": 0,
            "created_at": now,
            "scan_id": None,
            "status": "incomplete",
            "security_score": None,
        }]

    monkeypatch.setattr(url_group_service, "get_group", _fake_get_group)
    monkeypatch.setattr(
        url_group_service, "get_members_with_scan_status", _fake_get_members
    )

    response = await async_client.get(f"/api/v1/url-groups/{gid}/members")
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["members"][0]["status"] == "incomplete"
    assert data["data"]["members"][0]["scanId"] is None


@pytest.mark.asyncio
@pytest.mark.integration
async def test_update_group_200(async_client, monkeypatch) -> None:
    """Update group returns 200, name changed."""
    gid = uuid4()
    now = datetime.now(timezone.utc)

    class UpdatedGroup:
        id = gid
        name = "Updated Name"
        description = "New desc"
        created_at = now
        updated_at = now

    async def _fake_update_group(gid_in, db, name=None, description=None):
        return UpdatedGroup()

    async def _fake_get_member_count(g, db):
        return 0

    monkeypatch.setattr(url_group_service, "update_group", _fake_update_group)
    monkeypatch.setattr(url_group_service, "get_member_count", _fake_get_member_count)

    response = await async_client.put(
        f"/api/v1/url-groups/{gid}",
        json={"name": "Updated Name", "description": "New desc"},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["name"] == "Updated Name"


@pytest.mark.asyncio
@pytest.mark.integration
async def test_remove_member_200(async_client, monkeypatch) -> None:
    """Remove member returns 200."""
    gid = uuid4()
    mid = uuid4()

    async def _fake_remove_member(group_id, member_id, db):
        pass

    monkeypatch.setattr(url_group_service, "remove_member", _fake_remove_member)

    response = await async_client.delete(
        f"/api/v1/url-groups/{gid}/members/{mid}"
    )
    assert response.status_code == 200
    data = response.json()
    assert data["data"]["deleted"] is True


@pytest.mark.asyncio
@pytest.mark.integration
async def test_delete_group_200(async_client, monkeypatch) -> None:
    """Delete group returns 200."""
    gid = uuid4()

    async def _fake_delete_group(group_id, db):
        pass

    async def _fake_get_group(gid_in, db, include_members=False):
        class G:
            id = gid
            name = "G"
        return G()

    monkeypatch.setattr(url_group_service, "delete_group", _fake_delete_group)
    monkeypatch.setattr(url_group_service, "get_group", _fake_get_group)

    response = await async_client.delete(f"/api/v1/url-groups/{gid}")
    assert response.status_code == 200
    assert response.json()["data"]["deleted"] is True


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_deleted_group_404(async_client, monkeypatch) -> None:
    """GET deleted/nonexistent group returns 404."""
    gid = uuid4()

    async def _fake_get_group(gid_in, db, include_members=False):
        raise NotFoundError("GROUP_NOT_FOUND", "Group not found")

    monkeypatch.setattr(url_group_service, "get_group", _fake_get_group)
    monkeypatch.setattr(
        url_group_service, "get_members_with_scan_status", lambda g, db: []
    )

    response = await async_client.get(f"/api/v1/url-groups/{gid}")
    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.integration
async def test_get_nonexistent_group_404(async_client, monkeypatch) -> None:
    """GET nonexistent group returns 404."""
    missing_id = uuid4()

    async def _fake_get_group(gid_in, db, include_members=False):
        raise NotFoundError("GROUP_NOT_FOUND", "Group not found")

    monkeypatch.setattr(url_group_service, "get_group", _fake_get_group)

    response = await async_client.get(f"/api/v1/url-groups/{missing_id}")
    assert response.status_code == 404


@pytest.mark.asyncio
@pytest.mark.integration
async def test_url_normalization_example_com(async_client, monkeypatch) -> None:
    """URL EXAMPLE.COM/ is normalized to https://example.com."""
    gid = uuid4()
    mid = uuid4()
    now = datetime.now(timezone.utc)

    async def _fake_get_group(gid_in, db, include_members=False):
        class G:
            id = gid
            members = []
        return G()

    async def _fake_add_member(group_id, url, db, display_label=None):
        m = type("M", (), {
            "id": mid,
            "url": url,
            "display_label": display_label,
            "sort_order": 0,
            "created_at": now,
        })()
        return m

    monkeypatch.setattr(url_group_service, "get_group", _fake_get_group)
    monkeypatch.setattr(url_group_service, "add_member", _fake_add_member)

    response = await async_client.post(
        f"/api/v1/url-groups/{gid}/members",
        json={"url": "EXAMPLE.COM/"},
    )
    assert response.status_code == 201
    data = response.json()
    assert data["data"]["url"] == "https://example.com"
