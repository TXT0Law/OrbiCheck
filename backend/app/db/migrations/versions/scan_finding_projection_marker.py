"""Track which completed scans have had finding observations projected.

Revision ID: scan_finding_projection_marker
Revises: scan_finding_observations
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "scan_finding_projection_marker"
down_revision: Union[str, None] = "scan_finding_observations"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "scans",
        sa.Column("finding_observations_projected_at", sa.DateTime(timezone=True), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("scans", "finding_observations_projected_at")
