"""MonitorChangeResponse JSON aliases snapshotBeforeId / snapshotAfterId."""

from __future__ import annotations

from datetime import datetime, timezone
from uuid import uuid4

from app.api.v1.schemas.monitor import MonitorChangeResponse


def test_serialization_uses_snapshot_before_after_ids() -> None:
    cap = str(uuid4())
    row = MonitorChangeResponse(
        id=str(uuid4()),
        monitor_id=str(uuid4()),
        detected_at=datetime.now(timezone.utc),
        previous_snapshot_id="aa",
        current_snapshot_id="bb",
        diff_summary={"linesAdded": 1, "linesRemoved": 0, "linesChanged": 0},
        linked_visual_capture_id=cap,
        linked_visual_correlation="check_id",
    )
    out = row.model_dump(by_alias=True, mode="json")
    assert out["snapshotBeforeId"] == "aa"
    assert out["snapshotAfterId"] == "bb"
    assert out["linkedVisualCaptureId"] == cap
    assert out["linkedVisualCorrelation"] == "check_id"


def test_validation_accepts_alias_keys() -> None:
    mid = str(uuid4())
    cid = str(uuid4())
    now = datetime.now(timezone.utc)
    row = MonitorChangeResponse.model_validate(
        {
            "id": cid,
            "monitorId": mid,
            "detectedAt": now.isoformat(),
            "snapshotBeforeId": "p1",
            "snapshotAfterId": "p2",
            "diffSummary": {"linesAdded": 0, "linesRemoved": 0, "linesChanged": 0},
        }
    )
    assert row.previous_snapshot_id == "p1"
    assert row.current_snapshot_id == "p2"
