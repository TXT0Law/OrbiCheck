"""Unit tests for the C-3 trigger / ignore-word evaluation helpers."""

from __future__ import annotations

import pytest

from app.services.content_trigger_helpers import (
    TriggerRegexError,
    evaluate_content_triggers,
    get_content_trigger_config,
)


def test_no_config_always_notifies() -> None:
    cfg = get_content_trigger_config(None)
    result = evaluate_content_triggers("anything goes", cfg)
    assert result.notify is True
    assert result.suppress_reason is None
    assert result.matched_trigger is None


def test_trigger_words_require_match() -> None:
    cfg = get_content_trigger_config(
        {"content_change": {"thresholds": {"triggerWords": ["price drop", "Sale"]}}}
    )
    miss = evaluate_content_triggers("nothing interesting here", cfg)
    assert miss.notify is False
    assert miss.suppress_reason == "trigger_words_no_match"

    hit = evaluate_content_triggers("Big PRICE DROP today!", cfg)
    assert hit.notify is True
    assert hit.matched_trigger == "price drop"


def test_ignore_words_short_circuit() -> None:
    cfg = get_content_trigger_config(
        {
            "content_change": {
                "thresholds": {
                    "triggerWords": ["update"],
                    "ignoreWords": ["preview"],
                }
            }
        }
    )
    # Even though the trigger word matches, the ignore word wins — this
    # mirrors changedetection.io semantics.
    out = evaluate_content_triggers("New UPDATE preview is here", cfg)
    assert out.notify is False
    assert out.suppress_reason == "ignore_word:preview"


def test_trigger_regex_must_match_when_set() -> None:
    cfg = get_content_trigger_config(
        {
            "content_change": {
                "thresholds": {"triggerRegex": r"version\s+\d+\.\d+\.\d+"}
            }
        }
    )
    miss = evaluate_content_triggers("nothing version-related", cfg)
    assert miss.notify is False
    assert miss.suppress_reason == "trigger_regex_no_match"

    hit = evaluate_content_triggers("Released version 1.2.3 today", cfg)
    assert hit.notify is True


def test_trigger_regex_invalid_raises() -> None:
    with pytest.raises(TriggerRegexError):
        get_content_trigger_config(
            {"content_change": {"thresholds": {"triggerRegex": "[unterminated"}}}
        )


def test_word_lists_are_bounded_and_deduped() -> None:
    cfg = get_content_trigger_config(
        {
            "content_change": {
                "thresholds": {
                    "triggerWords": ["A", "a", "B", "B", "C"],
                    "ignoreWords": [
                        # Garbage entries are filtered.
                        "",
                        "   ",
                        "hello",
                    ],
                }
            }
        }
    )
    assert cfg.trigger_words == ("a", "b", "c")
    assert cfg.ignore_words == ("hello",)
