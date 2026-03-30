"""Unit tests for change category classification."""

from __future__ import annotations

import pytest

from app.services.content_change_helpers import classify_change_category


@pytest.mark.parametrize(
    ("n", "expected"),
    [
        (0, "small"),
        (10, "small"),
        (11, "medium"),
        (50, "medium"),
        (51, "large"),
        (1000, "large"),
    ],
)
def test_classify_change_category_boundaries(n: int, expected: str) -> None:
    assert classify_change_category(n) == expected
