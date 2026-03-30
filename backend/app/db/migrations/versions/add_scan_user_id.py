"""Add user_id column to scans table.

Revision ID: add_scan_user_id
Revises: rename_risk_to_security_score
Create Date: 2026-03-27
"""

from __future__ import annotations

from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = "add_scan_user_id"
down_revision: Union[str, None] = "rename_risk_to_security_score"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scans",
        sa.Column("user_id", sa.Integer(), nullable=False, server_default="1"),
    )
    op.create_index("ix_scans_user_id", "scans", ["user_id"], unique=False)
    op.alter_column("scans", "user_id", server_default=None)


def downgrade() -> None:
    op.drop_index("ix_scans_user_id", table_name="scans")
    op.drop_column("scans", "user_id")
