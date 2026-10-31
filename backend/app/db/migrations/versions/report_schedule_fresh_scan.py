"""Add opt-in fresh scans for scheduled reports.

Revision ID: report_schedule_fresh_scan
Revises: module_status_retrying_uppercase
"""

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "report_schedule_fresh_scan"
down_revision = "module_status_retrying_uppercase"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "report_schedules",
        sa.Column("rescan_before_report", sa.Boolean(), nullable=False, server_default=sa.false()),
    )
    op.add_column(
        "report_schedule_runs",
        sa.Column("scan_id", postgresql.UUID(as_uuid=True), nullable=True),
    )
    op.create_foreign_key(
        "fk_report_schedule_runs_scan_id", "report_schedule_runs", "scans", ["scan_id"], ["id"], ondelete="SET NULL"
    )


def downgrade() -> None:
    op.drop_constraint("fk_report_schedule_runs_scan_id", "report_schedule_runs", type_="foreignkey")
    op.drop_column("report_schedule_runs", "scan_id")
    op.drop_column("report_schedules", "rescan_before_report")
