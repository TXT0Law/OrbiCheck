"""Trigger / ignore-word evaluation for content_change (C-3).

These helpers run AFTER the standard threshold gating (size, lines, dedup)
and BEFORE the alert dispatch decision. The semantics mirror
changedetection.io:

* ``triggerWords``: at least one keyword (case-insensitive substring match
  on the new body) MUST appear; otherwise the change is recorded but
  notification is suppressed. Empty list = no constraint.
* ``ignoreWords``: any keyword present in the new body suppresses the
  notification entirely (the change row is still stored so the operator
  can audit later). Useful for filtering "currency conversion" widgets,
  cookie banners, etc.
* ``triggerRegex``: a single user-supplied regex that must match somewhere
  in the new body. Compiled lazily; invalid regexes raise
  :class:`TriggerRegexError` so the API layer can surface a 422 to the
  user instead of silently never firing the alert.

Both word lists are bounded so the JSONB blob can't be abused as a
denial-of-service vector. Comparison uses ``str.lower`` because regex
substrings against arbitrary HTML are too easy to footgun.
"""

from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any

# C-3: bound user-controlled inputs. The values are deliberately generous
# (more than any reasonable monitor needs) but cap the worst-case
# evaluation work per probe.
MAX_TRIGGER_WORDS = 32
MAX_IGNORE_WORDS = 32
MAX_WORD_LENGTH = 200
MAX_TRIGGER_REGEX_LENGTH = 500


class TriggerRegexError(ValueError):
    """Raised when ``triggerRegex`` is unparseable; surfaced as HTTP 422."""

    def __init__(self, message: str) -> None:
        super().__init__(message)


@dataclass(frozen=True)
class ContentTriggerConfig:
    trigger_words: tuple[str, ...]
    ignore_words: tuple[str, ...]
    trigger_regex: re.Pattern[str] | None


def _coerce_words(raw: Any, *, max_count: int) -> tuple[str, ...]:
    if not isinstance(raw, list):
        return ()
    out: list[str] = []
    for entry in raw[:max_count]:
        if not isinstance(entry, str):
            continue
        cleaned = entry.strip()
        if not cleaned or len(cleaned) > MAX_WORD_LENGTH:
            continue
        out.append(cleaned.lower())
    # De-duplicate while preserving order so logs stay deterministic.
    seen: set[str] = set()
    deduped: list[str] = []
    for word in out:
        if word in seen:
            continue
        seen.add(word)
        deduped.append(word)
    return tuple(deduped)


def get_content_trigger_config(
    capabilities: dict[str, Any] | None,
) -> ContentTriggerConfig:
    """Parse content_change.thresholds {trigger,ignore}Words / triggerRegex.

    Missing keys / non-list values yield empty tuples (the no-op default).
    Invalid ``triggerRegex`` raises :class:`TriggerRegexError` so callers
    can convert it to a 422 at the API boundary.
    """
    caps = capabilities or {}
    raw_cc = caps.get("content_change") if isinstance(caps, dict) else None
    if not isinstance(raw_cc, dict):
        return ContentTriggerConfig(trigger_words=(), ignore_words=(), trigger_regex=None)
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        return ContentTriggerConfig(trigger_words=(), ignore_words=(), trigger_regex=None)

    trigger_words = _coerce_words(th.get("triggerWords"), max_count=MAX_TRIGGER_WORDS)
    ignore_words = _coerce_words(th.get("ignoreWords"), max_count=MAX_IGNORE_WORDS)

    raw_regex = th.get("triggerRegex")
    compiled: re.Pattern[str] | None = None
    if isinstance(raw_regex, str) and raw_regex.strip():
        if len(raw_regex) > MAX_TRIGGER_REGEX_LENGTH:
            raise TriggerRegexError(
                f"triggerRegex exceeds {MAX_TRIGGER_REGEX_LENGTH} chars"
            )
        try:
            compiled = re.compile(raw_regex, flags=re.IGNORECASE | re.DOTALL)
        except re.error as exc:
            raise TriggerRegexError(f"Invalid triggerRegex: {exc}") from exc

    return ContentTriggerConfig(
        trigger_words=trigger_words,
        ignore_words=ignore_words,
        trigger_regex=compiled,
    )


@dataclass(frozen=True)
class TriggerEvaluation:
    """Outcome of evaluating a body against the trigger/ignore config."""

    notify: bool
    suppress_reason: str | None
    matched_trigger: str | None


def evaluate_content_triggers(
    body: str,
    config: ContentTriggerConfig,
) -> TriggerEvaluation:
    """Decide whether a content change should produce a notification.

    The MonitorChange row is always stored regardless of this verdict; this
    function only governs alert dispatch.
    """
    if not config.trigger_words and not config.ignore_words and config.trigger_regex is None:
        return TriggerEvaluation(notify=True, suppress_reason=None, matched_trigger=None)

    lowered = body.lower() if isinstance(body, str) else ""

    for ignore in config.ignore_words:
        if ignore in lowered:
            return TriggerEvaluation(
                notify=False,
                suppress_reason=f"ignore_word:{ignore}",
                matched_trigger=None,
            )

    matched_trigger: str | None = None
    if config.trigger_words:
        for word in config.trigger_words:
            if word in lowered:
                matched_trigger = word
                break
        if matched_trigger is None:
            return TriggerEvaluation(
                notify=False,
                suppress_reason="trigger_words_no_match",
                matched_trigger=None,
            )

    if config.trigger_regex is not None:
        if not config.trigger_regex.search(body or ""):
            return TriggerEvaluation(
                notify=False,
                suppress_reason="trigger_regex_no_match",
                matched_trigger=matched_trigger,
            )

    return TriggerEvaluation(
        notify=True,
        suppress_reason=None,
        matched_trigger=matched_trigger,
    )
