"""URL Group service for CRUD and member management."""

import logging
import uuid
from typing import Any

from sqlalchemy import desc, func, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from app.core.exceptions import ConflictError, NotFoundError
from app.models.scan import Scan
from app.models.url_group import UrlGroup, UrlGroupMember
from app.utils.url_parser import normalize_url

logger = logging.getLogger(__name__)

MAX_MEMBERS_PER_GROUP = 100


async def create_group(
    name: str,
    db: AsyncSession,
    description: str | None = None,
) -> UrlGroup:
    """Create a new URL group. Raises ConflictError if name already exists."""
    stmt = select(UrlGroup).where(UrlGroup.name == name)
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise ConflictError(
            code="GROUP_NAME_EXISTS",
            message=f"Group with name '{name}' already exists",
        )
    group = UrlGroup(name=name, description=description)
    db.add(group)
    await db.flush()
    logger.info("url_group_created", group_id=str(group.id), name=name)
    return group


async def get_group(
    group_id: uuid.UUID,
    db: AsyncSession,
    include_members: bool = False,
) -> UrlGroup:
    """Get group by ID. Raises NotFoundError if not found."""
    stmt = select(UrlGroup).where(UrlGroup.id == group_id)
    if include_members:
        stmt = stmt.options(selectinload(UrlGroup.members))
    result = await db.execute(stmt)
    group = result.scalar_one_or_none()
    if not group:
        raise NotFoundError(
            code="GROUP_NOT_FOUND",
            message=f"Group with id {group_id} not found",
        )
    return group


async def list_groups(
    db: AsyncSession,
    skip: int = 0,
    limit: int = 50,
) -> tuple[list[tuple[UrlGroup, int]], int]:
    """
    List groups ordered by updated_at DESC.
    Returns ((group, member_count), total_count).
    """
    count_stmt = select(func.count()).select_from(UrlGroup)
    total = (await db.execute(count_stmt)).scalar_one()

    member_count_subq = (
        select(func.count())
        .select_from(UrlGroupMember)
        .where(UrlGroupMember.group_id == UrlGroup.id)
        .correlate(UrlGroup)
        .scalar_subquery()
    )
    stmt = (
        select(UrlGroup, member_count_subq.label("member_count"))
        .order_by(desc(UrlGroup.updated_at))
        .offset(skip)
        .limit(limit)
    )
    result = await db.execute(stmt)
    rows = result.all()
    return rows, total


async def update_group(
    group_id: uuid.UUID,
    db: AsyncSession,
    name: str | None = None,
    description: str | None = None,
) -> UrlGroup:
    """Update group. Raises ConflictError if new name already exists."""
    group = await get_group(group_id, db)
    if name is not None:
        if name != group.name:
            stmt = select(UrlGroup).where(UrlGroup.name == name)
            result = await db.execute(stmt)
            if result.scalar_one_or_none():
                raise ConflictError(
                    code="GROUP_NAME_EXISTS",
                    message=f"Group with name '{name}' already exists",
                )
        group.name = name
    if description is not None:
        group.description = description
    await db.flush()
    logger.info("url_group_updated", group_id=str(group_id), name=name)
    return group


async def delete_group(group_id: uuid.UUID, db: AsyncSession) -> None:
    """Delete group and cascade members."""
    group = await get_group(group_id, db)
    await db.delete(group)
    await db.flush()
    logger.info("url_group_deleted", group_id=str(group_id))


async def add_member(
    group_id: uuid.UUID,
    url: str,
    db: AsyncSession,
    display_label: str | None = None,
) -> UrlGroupMember:
    """Add URL to group. Normalizes URL, checks duplicate and limit."""
    normalized = normalize_url(url)
    if not normalized:
        raise ValueError("Invalid or empty URL")

    group = await get_group(group_id, db, include_members=True)
    member_count = len(group.members)
    if member_count >= MAX_MEMBERS_PER_GROUP:
        raise ConflictError(
            code="MEMBER_LIMIT",
            message=f"Group cannot have more than {MAX_MEMBERS_PER_GROUP} members",
        )

    stmt = select(UrlGroupMember).where(
        UrlGroupMember.group_id == group_id,
        UrlGroupMember.url == normalized,
    )
    result = await db.execute(stmt)
    if result.scalar_one_or_none():
        raise ConflictError(
            code="URL_ALREADY_IN_GROUP",
            message=f"URL {normalized} is already in this group",
        )

    max_order_stmt = (
        select(func.coalesce(func.max(UrlGroupMember.sort_order), 0))
        .where(UrlGroupMember.group_id == group_id)
    )
    max_order = (await db.execute(max_order_stmt)).scalar_one()
    sort_order = max_order + 1

    member = UrlGroupMember(
        group_id=group_id,
        url=normalized,
        display_label=display_label,
        sort_order=sort_order,
    )
    db.add(member)
    await db.flush()
    logger.info("url_group_member_added", group_id=str(group_id), url=normalized)
    return member


async def remove_member(
    group_id: uuid.UUID,
    member_id: uuid.UUID,
    db: AsyncSession,
) -> None:
    """Remove member from group. Raises NotFoundError if not found."""
    stmt = select(UrlGroupMember).where(
        UrlGroupMember.id == member_id,
        UrlGroupMember.group_id == group_id,
    )
    result = await db.execute(stmt)
    member = result.scalar_one_or_none()
    if not member:
        raise NotFoundError(
            code="MEMBER_NOT_FOUND",
            message=f"Member {member_id} not found in group",
        )
    await db.delete(member)
    await db.flush()
    logger.info("url_group_member_removed", group_id=str(group_id), member_id=str(member_id))


async def get_members_with_scan_status(
    group_id: uuid.UUID,
    db: AsyncSession,
) -> list[dict[str, Any]]:
    """Get group members with their latest scan status and security_score."""
    group = await get_group(group_id, db, include_members=True)
    members = sorted(group.members, key=lambda m: m.sort_order)

    out: list[dict[str, Any]] = []
    for member in members:
        # Get latest scan for this URL
        scan_stmt = (
            select(Scan)
            .where(Scan.url == member.url)
            .order_by(desc(Scan.created_at))
            .limit(1)
        )
        scan_result = await db.execute(scan_stmt)
        latest_scan = scan_result.scalar_one_or_none()

        row: dict[str, Any] = {
            "id": str(member.id),
            "url": member.url,
            "display_label": member.display_label,
            "sort_order": member.sort_order,
            "created_at": member.created_at,
            "scan_id": str(latest_scan.id) if latest_scan else None,
            "status": latest_scan.status.value if latest_scan else "incomplete",
            "security_score": latest_scan.security_score if latest_scan else None,
        }
        out.append(row)

    return out


async def get_member_count(group_id: uuid.UUID, db: AsyncSession) -> int:
    """Get number of members in group."""
    stmt = (
        select(func.count())
        .select_from(UrlGroupMember)
        .where(UrlGroupMember.group_id == group_id)
    )
    return (await db.execute(stmt)).scalar_one()
