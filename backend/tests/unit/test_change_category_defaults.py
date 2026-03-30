"""Parity between Python defaults and shared TS constants (documented in docs/api/monitor-changes.md)."""

from __future__ import annotations

from app.core.change_category_defaults import (
    DEFAULT_CHANGE_CATEGORY_MEDIUM_MAX,
    DEFAULT_CHANGE_CATEGORY_SMALL_MAX,
)
from app.core.config import settings


def test_settings_use_same_default_constants() -> None:
    assert settings.CHANGE_CATEGORY_SMALL_MAX == DEFAULT_CHANGE_CATEGORY_SMALL_MAX
    assert settings.CHANGE_CATEGORY_MEDIUM_MAX == DEFAULT_CHANGE_CATEGORY_MEDIUM_MAX
    assert DEFAULT_CHANGE_CATEGORY_SMALL_MAX == 10
    assert DEFAULT_CHANGE_CATEGORY_MEDIUM_MAX == 50
