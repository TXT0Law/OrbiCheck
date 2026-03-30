"""Monitor ↔ AlertEvent ORM wiring (relationship declared on Monitor)."""

from sqlalchemy.orm import class_mapper

from app.models.monitor import Monitor


def test_monitor_has_alert_events_relationship() -> None:
    rels = class_mapper(Monitor).relationships
    assert "alert_events" in rels
