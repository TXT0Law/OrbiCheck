"""Add normalization_version to monitor snapshots.

Revision ID: snapshot_normalization_version
Revises: content_change_enhancements
Create Date: 2026-03-24

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "snapshot_normalization_version"
down_revision: Union[str, None] = "content_change_enhancements"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_monitor_snapshots",
        sa.Column(
            "normalization_version",
            sa.Integer(),
            nullable=False,
            server_default="0",
        ),
    )
    op.alter_column(
        "osint_monitor_snapshots",
        "normalization_version",
        server_default=None,
    )


def downgrade() -> None:
    op.drop_column("osint_monitor_snapshots", "normalization_version")
