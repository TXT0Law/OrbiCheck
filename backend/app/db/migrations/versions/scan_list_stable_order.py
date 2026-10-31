"""Support stable newest-first scan lists with a composite index.

Revision ID: scan_list_stable_order
Revises: report_schedule_fresh_scan
"""

from alembic import op

revision = "scan_list_stable_order"
down_revision = "report_schedule_fresh_scan"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_index(
        "ix_scans_user_created_id",
        "scans",
        ["user_id", "created_at", "id"],
    )
    op.drop_index("ix_scans_user_id", table_name="scans")


def downgrade() -> None:
    op.create_index("ix_scans_user_id", "scans", ["user_id"])
    op.drop_index("ix_scans_user_created_id", table_name="scans")
