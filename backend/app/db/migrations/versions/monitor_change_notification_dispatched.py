"""Add notification_dispatched to monitor changes for alert audit.

Revision ID: mon_ch_notify_disp (must fit alembic_version.version_num VARCHAR(32))
Revises: monitor_visual_captures
Create Date: 2026-03-25

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "mon_ch_notify_disp"
down_revision: Union[str, None] = "monitor_visual_captures"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_monitor_changes",
        sa.Column(
            "notification_dispatched",
            sa.Boolean(),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("osint_monitor_changes", "notification_dispatched")
