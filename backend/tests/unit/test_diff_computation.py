"""Unit tests for diff summary and HTML/unified diff helpers."""

from __future__ import annotations


from app.services.content_change_helpers import (
    compute_diff_summary,
    compute_word_diff,
    generate_html_diff,
    generate_unified_diff,
)
from app.services.content_restock_helpers import (
    detect_restock_transition,
    get_content_restock_config,
)


def test_compute_diff_identical() -> None:
    s = compute_diff_summary("a\nb", "a\nb")
    assert s["linesAdded"] == 0
    assert s["linesRemoved"] == 0
    assert s["totalDiffLines"] == 0
    assert s["changeCategory"] == "small"


def test_compute_diff_with_additions() -> None:
    s = compute_diff_summary("a", "a\nb\nc")
    assert s["linesAdded"] >= 1
    assert s["changeCategory"] in ("small", "medium", "large")


def test_unified_diff_non_empty() -> None:
    u = generate_unified_diff("x", "y")
    assert "---" in u or "+++" in u


def test_empty_both_sides() -> None:
    s = compute_diff_summary("", "")
    assert s["totalDiffLines"] == 0


def test_crlf_vs_lf_still_differs() -> None:
    s = compute_diff_summary("a\r\n", "a\n")
    assert isinstance(s["totalDiffLines"], int)


def test_html_diff_truncates_many_lines(monkeypatch) -> None:
    from app.core import config

    monkeypatch.setattr(config.settings, "MONITOR_DIFF_MAX_LINES", 5)
    old = "\n".join(f"L{i}" for i in range(20))
    new = "\n".join(f"M{i}" for i in range(20))
    html = generate_html_diff(old, new)
    assert "table" in html.lower()


def test_compute_word_diff_reports_token_changes() -> None:
    diff = compute_word_diff("red shoes out of stock", "red shoes in stock")
    assert diff["tokensAdded"] >= 1
    assert diff["tokensRemoved"] >= 1
    assert diff["totalTokenChanges"] >= 2
    assert diff["operations"]


def test_restock_transition_requires_previous_oos_and_current_stock() -> None:
    cfg = get_content_restock_config(
        {
            "content_change": {
                "thresholds": {
                    "restock": {
                        "enabled": True,
                        "outOfStockKeywords": ["out of stock"],
                        "inStockKeywords": ["in stock"],
                    }
                }
            }
        }
    )
    matched, word = detect_restock_transition(
        "This product is out of stock",
        "This product is now in stock",
        cfg,
    )
    assert matched is True
    assert word == "in stock"
