"""Align the module status enum with SQLAlchemy enum-name storage.

Revision ID: module_status_retrying_uppercase
Revises: operational_events
Create Date: 2026-07-21
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op

revision: str = "module_status_retrying_uppercase"
down_revision: Union[str, None] = "operational_events"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.execute("ALTER TYPE modulestatus ADD VALUE IF NOT EXISTS 'RETRYING'")


def downgrade() -> None:
    # PostgreSQL cannot remove an enum value without recreating the type.
    pass
