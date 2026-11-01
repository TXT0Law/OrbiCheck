"""Keep malformed historical scans distinct from clean and pending projections.

Revision ID: scan_finding_projection_failure
Revises: scan_finding_backfill_index
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "scan_finding_projection_failure"
down_revision: Union[str, None] = "scan_finding_backfill_index"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scans",
        sa.Column(
            "finding_observations_projection_failed_at",
            sa.DateTime(timezone=True),
            nullable=True,
        ),
    )


def downgrade() -> None:
    op.drop_column("scans", "finding_observations_projection_failed_at")
