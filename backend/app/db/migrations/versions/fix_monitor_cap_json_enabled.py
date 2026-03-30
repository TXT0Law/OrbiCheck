"""Re-merge monitor capabilities JSON so per-key enabled matches enabled_capabilities.

Revision ID: fix_monitor_cap_json_enabled
Revises: normalize_monitor_caps
Create Date: 2026-03-24

"""

from __future__ import annotations

import json
from typing import Sequence, Union

from alembic import op
from sqlalchemy import text

revision: str = "fix_monitor_cap_json_enabled"
down_revision: Union[str, None] = "normalize_monitor_caps"
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

CAPABILITY_KEYS = ("uptime_only", "content_change", "ssl_expiry", "visual_change")


def upgrade() -> None:
    conn = op.get_bind()
    from app.core.monitor_defaults import capabilities_from_enabled_list, merge_capability_dict

    rows = conn.execute(
        text("SELECT id, enabled_capabilities, capabilities FROM osint_monitors")
    ).fetchall()
    for row in rows:
        rid = row[0]
        en = row[1] or []
        caps = row[2] if isinstance(row[2], dict) else {}
        new_en = [str(x).strip().lower().replace("-", "_") for x in en]
        new_en = [x for x in new_en if x in CAPABILITY_KEYS]
        if not new_en:
            new_en = ["uptime_only"]
        fresh = capabilities_from_enabled_list(new_en)
        merged = merge_capability_dict(fresh, caps)
        arr_lit = "{" + ",".join(new_en) + "}"
        conn.execute(
            text(
                f"UPDATE osint_monitors SET enabled_capabilities = '{arr_lit}'::varchar(32)[], "
                "capabilities = CAST(:c AS jsonb) WHERE id = :id"
            ),
            {"c": json.dumps(merged), "id": rid},
        )


def downgrade() -> None:
    pass
