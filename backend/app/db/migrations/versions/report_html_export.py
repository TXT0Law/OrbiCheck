"""Add reports.content_html column for the HTML export format (T4.2).

Revision ID: report_html_export
Revises: phase3_notif
Create Date: 2026-05-05
"""

from __future__ import annotations

from typing import Sequence, Union

import sqlalchemy as sa
from alembic import op

revision: str = "report_html_export"
down_revision: Union[str, None] = "phase3_notif"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        "reports",
        sa.Column("content_html", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column("reports", "content_html")
