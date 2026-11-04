"""Make pending scheduled report runs discoverable for broker recovery."""

from alembic import op
import sqlalchemy as sa

revision = "report_run_dispatch"
down_revision = "scan_finding_projection_failure"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "report_schedule_runs",
        sa.Column("next_dispatch_at", sa.DateTime(timezone=True), server_default=sa.func.now(), nullable=False),
    )
    op.add_column("report_schedule_runs", sa.Column("allow_paused", sa.Boolean(), server_default=sa.false(), nullable=False))
    op.create_index("ix_report_run_dispatch", "report_schedule_runs", ["status", "next_dispatch_at", "id"])


def downgrade() -> None:
    op.drop_index("ix_report_run_dispatch", table_name="report_schedule_runs")
    op.drop_column("report_schedule_runs", "allow_paused")
    op.drop_column("report_schedule_runs", "next_dispatch_at")
