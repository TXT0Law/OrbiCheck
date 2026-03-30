"""Add ssl_snapshot on checks and last_ssl_probe_at on monitors.

Revision ID: ssl_snapshot_and_last_probe
Revises: snapshot_normalization_version
Create Date: 2026-03-24

"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects.postgresql import JSONB

revision: str = "ssl_snapshot_and_last_probe"
down_revision: Union[str, None] = "snapshot_normalization_version"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "osint_monitor_checks",
        sa.Column("ssl_snapshot", JSONB(astext_type=sa.Text()), nullable=True),
    )
    op.add_column(
        "osint_monitors",
        sa.Column(
            "last_ssl_probe_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("osint_monitors", "last_ssl_probe_at")
    op.drop_column("osint_monitor_checks", "ssl_snapshot")
