"""Add consecutive_failures and last_success to osint_monitors.

Revision ID: add_monitor_uptime_fields
Revises: fix_monitor_cap_json_enabled
Create Date: 2026-03-24

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "add_monitor_uptime_fields"
down_revision: Union[str, None] = "fix_monitor_cap_json_enabled"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_monitors",
        sa.Column("consecutive_failures", sa.Integer(), nullable=False, server_default="0"),
    )
    op.add_column(
        "osint_monitors",
        sa.Column("last_success", sa.Boolean(), nullable=True),
    )
    op.alter_column("osint_monitors", "consecutive_failures", server_default=None)


def downgrade() -> None:
    op.drop_column("osint_monitors", "last_success")
    op.drop_column("osint_monitors", "consecutive_failures")
