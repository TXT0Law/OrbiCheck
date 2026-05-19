"""Pure helpers for content change detection (diff, thresholds, response validation).

Threat model (P0 noise suppression):
- Degraded-page detection uses HTML/title heuristics; attackers could craft pages that
  look like bot checks without being one, or real bot walls may not match patterns.
- Normalization replaces UUIDs and long hex runs; legitimate content that differs only
  by those shapes may be treated as unchanged. Disable normalizeVolatileTokens to use
  raw byte hashing for a monitor.
"""

from __future__ import annotations

import difflib
import hashlib
import re
from dataclasses import dataclass
from typing import Any, Literal

import httpx

from app.core.config import settings

# Volatile substrings replaced before fingerprint hashing (conservative).
_UUID_PATTERN = re.compile(
    r"\b[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\b"
)
# Long hex tokens (e.g. cache keys); 32+ chars to avoid matching short CSS hashes.
_LONG_HEX_PATTERN = re.compile(r"\b[0-9a-fA-F]{32,}\b")

# Optional second-stage body normalization (gated by settings + CONTENT_EXTENDED_VOLATILE_*).
# Narrow: typical Unix ms timestamps and second timestamps (may still false-negative on numeric content).
_TS_MS_13 = re.compile(r"\b[12]\d{12}\b")
_TS_S_10 = re.compile(r"\b[12]\d{9}\b")

# Second pass on unified-diff *text* before fingerprint hashing (optional).
_DIFF_FP_EXTRA_DIGITS = re.compile(r"\b\d{4,}\b")
_WORD_TOKEN_PATTERN = re.compile(r"\w+|[^\w\s]", re.UNICODE)

# Case-insensitive HTML snippets that often indicate anti-bot / risk pages (not stable content).
_DEGRADED_BODY_MARKERS: tuple[str, ...] = (
    "g-recaptcha",
    "hcaptcha",
    "cf-browser-verification",
    "cf-challenge",
    "attention required",
    "checking your browser",
    "just a moment",
    "ddos protection by",
    "cf-ray",
    "turnstile",
    "verify you are human",
    "are you a robot",
    "robot or human",
    "datadome",
    "perimeterx",
)

# Title-only keywords (narrower than body text to reduce false positives).
_DEGRADED_TITLE_KEYWORDS: tuple[str, ...] = (
    "captcha",
    "access denied",
    "attention required",
    "just a moment",
    "please wait",
    "robot check",
)

BLOCKED_CONTENT_TYPE_PREFIXES: frozenset[str] = frozenset(
    {
        "application/octet-stream",
        "application/zip",
        "application/pdf",
        "application/x-msdownload",
    }
)


def normalize_body_for_comparison(
    body: str,
    *,
    custom_rules: list[tuple[re.Pattern[str], str]] | None = None,
    apply_extended_volatile: bool = False,
) -> str:
    """
    Replace volatile-looking substrings so identical pages after normalization share a hash.

    Conservative: only UUIDs, long hex runs, and optional per-monitor regex rules (P3).
    When ``apply_extended_volatile`` is True and settings allow it, also collapse common
    timestamp-shaped numerics (may hide legitimate numeric-only edits — keep off unless needed).
    """
    s = _UUID_PATTERN.sub("<UUID>", body)
    s = _LONG_HEX_PATTERN.sub("<HEX>", s)
    if custom_rules:
        for pat, repl in custom_rules:
            s = pat.sub(repl, s)
    if apply_extended_volatile and settings.CONTENT_EXTENDED_VOLATILE_NORMALIZATION_ENABLED:
        s = _TS_MS_13.sub("<TS>", s)
        s = _TS_S_10.sub("<TS>", s)
    return s


def normalize_unified_diff_text_for_fingerprint(text: str) -> str:
    """Optional extra pass: stabilize fingerprint when only long digit runs differ inside hunks."""
    return _DIFF_FP_EXTRA_DIGITS.sub("<N>", text)


def get_effective_dedup_window_seconds(capabilities: dict[str, Any] | None) -> int:
    """
    Per-monitor override: content_change.thresholds.dedupWindowSeconds (seconds).

    Null / missing uses settings.MONITOR_CHANGE_DEDUP_WINDOW_SECONDS. Clamped to [1, 86400].
    """
    base = int(settings.MONITOR_CHANGE_DEDUP_WINDOW_SECONDS)
    caps = capabilities or {}
    raw_cc = caps.get("content_change")
    if not isinstance(raw_cc, dict):
        return base
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        return base
    raw = th.get("dedupWindowSeconds")
    if raw is None:
        return base
    try:
        w = int(raw)
    except (TypeError, ValueError):
        return base
    if w <= 0:
        return base
    return max(1, min(w, 86400))


def compile_custom_normalization_rules(
    capabilities: dict[str, Any] | None,
) -> list[tuple[re.Pattern[str], str]]:
    """
    Parse content_change.thresholds.normalizationRules: [{ pattern, replacement }, ...].

    Invalid regex entries are skipped. Limited count and pattern length for safety.
    """
    caps = capabilities or {}
    raw_cc = caps.get("content_change")
    if not isinstance(raw_cc, dict):
        return []
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        return []
    raw_rules = th.get("normalizationRules")
    if not isinstance(raw_rules, list):
        return []
    out: list[tuple[re.Pattern[str], str]] = []
    cap_n = min(len(raw_rules), settings.MONITOR_NORMALIZATION_CUSTOM_RULES_MAX)
    for item in raw_rules[:cap_n]:
        if not isinstance(item, dict):
            continue
        pat_s = item.get("pattern")
        repl = item.get("replacement", "")
        if not isinstance(pat_s, str) or len(pat_s) > 500:
            continue
        if not isinstance(repl, str) or len(repl) > 200:
            continue
        try:
            out.append((re.compile(pat_s), repl))
        except re.error:
            continue
    return out


def compute_content_fingerprint(
    body: str,
    *,
    normalize: bool,
    custom_rules: list[tuple[re.Pattern[str], str]] | None = None,
    apply_extended_volatile: bool = False,
) -> str:
    """SHA-256 hex of UTF-8 body (optionally normalized) for change detection."""
    if normalize:
        text = normalize_body_for_comparison(
            body,
            custom_rules=custom_rules,
            apply_extended_volatile=apply_extended_volatile,
        )
    else:
        text = body
    raw = text.encode("utf-8", errors="replace")
    return hashlib.sha256(raw).hexdigest()


def compute_unified_diff_fingerprint(
    prev_body: str,
    new_body: str,
    *,
    custom_rules: list[tuple[re.Pattern[str], str]] | None = None,
    apply_extended_body_norm: bool = False,
) -> str:
    """
    Fingerprint of the unified diff text (bounded) for deduplicating near-identical changes.

    Uses the same normalization pipeline as body fingerprints when custom_rules is set.
    Optional second pass on diff text collapses long digit runs when
    MONITOR_DIFF_FINGERPRINT_EXTRA_NORMALIZE is enabled.
    """
    ud = generate_unified_diff(prev_body, new_body, max_lines=settings.DIFF_MAX_LINES)
    cap = settings.MONITOR_DIFF_FINGERPRINT_MAX_UNIFIED_CHARS
    if len(ud) > cap:
        ud = ud[:cap]
    norm = normalize_body_for_comparison(
        ud,
        custom_rules=custom_rules,
        apply_extended_volatile=apply_extended_body_norm,
    )
    if settings.MONITOR_DIFF_FINGERPRINT_EXTRA_NORMALIZE:
        norm = normalize_unified_diff_text_for_fingerprint(norm)
    return hashlib.sha256(norm.encode("utf-8", errors="replace")).hexdigest()


def detect_degraded_page(body: str) -> tuple[bool, str | None]:
    """
    Heuristic: page may be a bot-check / captcha / risk page rather than stable content.

    Returns (is_degraded, reason_code) for logging.
    """
    lowered = body.lower()
    for marker in _DEGRADED_BODY_MARKERS:
        if marker in lowered:
            return True, f"body:{marker}"

    m = re.search(r"<title[^>]*>([^<]{0,200})</title>", body, flags=re.IGNORECASE | re.DOTALL)
    if m:
        title = m.group(1).lower()
        for kw in _DEGRADED_TITLE_KEYWORDS:
            if kw in title:
                return True, f"title:{kw}"
    return False, None


def classify_change_category(total_diff_lines: int) -> Literal["small", "medium", "large"]:
    """Map diff line count to UI category (aligned with shared types)."""
    if total_diff_lines <= settings.CHANGE_CATEGORY_SMALL_MAX:
        return "small"
    if total_diff_lines <= settings.CHANGE_CATEGORY_MEDIUM_MAX:
        return "medium"
    return "large"


def _first_diff_preview_line(
    old_content: str,
    new_content: str,
    *,
    max_chars: int = 120,
) -> str:
    """One-line preview from first real unified-diff hunk line (for timeline UI)."""
    ud = generate_unified_diff(old_content, new_content, max_lines=120)
    for line in ud.splitlines():
        if line.startswith("+++") or line.startswith("---") or line.startswith("@@"):
            continue
        if line.startswith("+") or line.startswith("-"):
            body = line[1:].strip().replace("\t", " ")
            if not body:
                continue
            prefix = "+" if line[0] == "+" else "-"
            if len(body) > max_chars:
                body = body[: max_chars - 1] + "…"
            return prefix + body
    return ""


def compute_diff_summary(old_content: str, new_content: str) -> dict[str, Any]:
    """Build diff_summary dict (camelCase keys for JSONB / frontend)."""
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    diff = list(
        difflib.unified_diff(
            old_lines,
            new_lines,
            fromfile="before",
            tofile="after",
            lineterm="",
        )
    )
    lines_added = sum(
        1 for line in diff if line.startswith("+") and not line.startswith("+++")
    )
    lines_removed = sum(
        1 for line in diff if line.startswith("-") and not line.startswith("---")
    )
    lines_changed = min(lines_added, lines_removed)
    total_diff_lines = lines_added + lines_removed
    out: dict[str, Any] = {
        "linesAdded": lines_added,
        "linesRemoved": lines_removed,
        "linesChanged": lines_changed,
        "totalDiffLines": total_diff_lines,
        "changeCategory": classify_change_category(total_diff_lines),
    }
    preview = _first_diff_preview_line(old_content, new_content)
    if preview:
        out["previewLine"] = preview
    return out


def generate_unified_diff(
    old_content: str,
    new_content: str,
    *,
    max_lines: int | None = None,
) -> str:
    """Return unified diff text. Optional ``max_lines`` caps each side before diffing."""
    old_lines = old_content.splitlines(keepends=True)
    new_lines = new_content.splitlines(keepends=True)
    cap = max_lines if max_lines is not None else settings.DIFF_MAX_LINES
    if len(old_lines) > cap:
        old_lines = old_lines[:cap]
    if len(new_lines) > cap:
        new_lines = new_lines[:cap]
    diff = difflib.unified_diff(
        old_lines,
        new_lines,
        fromfile="before",
        tofile="after",
    )
    return "".join(diff)


def compute_word_diff(
    old_content: str,
    new_content: str,
    *,
    max_tokens: int | None = None,
) -> dict[str, Any]:
    """Return a compact word-level diff for article-style pages."""
    cap = max_tokens if max_tokens is not None else settings.DIFF_MAX_LINES * 40
    old_tokens = _WORD_TOKEN_PATTERN.findall(old_content)[:cap]
    new_tokens = _WORD_TOKEN_PATTERN.findall(new_content)[:cap]
    matcher = difflib.SequenceMatcher(a=old_tokens, b=new_tokens, autojunk=False)
    ops: list[dict[str, Any]] = []
    added = 0
    removed = 0
    for tag, i1, i2, j1, j2 in matcher.get_opcodes():
        if tag == "equal":
            continue
        before = old_tokens[i1:i2]
        after = new_tokens[j1:j2]
        removed += len(before)
        added += len(after)
        ops.append(
            {
                "type": tag,
                "removed": before,
                "added": after,
            }
        )
    return {
        "tokensAdded": added,
        "tokensRemoved": removed,
        "totalTokenChanges": added + removed,
        "operations": ops[:200],
        "truncated": len(old_tokens) >= cap or len(new_tokens) >= cap,
    }


def generate_html_diff(
    old_content: str,
    new_content: str,
    *,
    max_lines: int | None = None,
) -> str:
    """
    Build HTML diff table; caller must truncate by char/line limits first.

    HtmlDiff is expensive on huge inputs; enforce a line cap (default DIFF_MAX_LINES).
    """
    old_lines = old_content.splitlines()
    new_lines = new_content.splitlines()
    cap = max_lines if max_lines is not None else settings.DIFF_MAX_LINES
    if len(old_lines) > cap:
        old_lines = old_lines[:cap]
    if len(new_lines) > cap:
        new_lines = new_lines[:cap]
    differ = difflib.HtmlDiff(tabsize=4, wrapcolumn=120)
    return differ.make_table(
        old_lines,
        new_lines,
        fromdesc="Previous",
        todesc="Current",
        context=True,
        numlines=3,
    )


def extract_charset(content_type: str, response: httpx.Response) -> str:
    """Declared charset from Content-Type, else httpx encoding, else utf-8."""
    ct = content_type or ""
    m = re.search(r"charset\s*=\s*([^\s;]+)", ct, flags=re.IGNORECASE)
    if m:
        return m.group(1).strip().strip('"').strip("'")
    return (response.encoding or "utf-8").lower()


def validate_content_response(response: httpx.Response) -> None:
    """
    Reject non-text responses for content monitoring.

    Raises:
        ValueError: When Content-Type indicates binary or media.
    """
    ct = (response.headers.get("content-type") or "").lower()
    for blocked in BLOCKED_CONTENT_TYPE_PREFIXES:
        if blocked in ct:
            raise ValueError(f"Content type not suitable for content monitoring: {ct}")
    if ct.startswith("image/") or ct.startswith("video/") or ct.startswith("audio/"):
        raise ValueError(f"Content type not suitable for content monitoring: {ct}")


@dataclass(frozen=True)
class ContentThresholds:
    """Thresholds from monitor.capabilities.content_change.thresholds."""

    alert_on_change: bool = True
    min_change_size_bytes: int = 0
    min_total_diff_lines: int = 0
    normalize_volatile_tokens: bool = True
    suppress_degraded_page_changes: bool = True


def _parse_bool_threshold(value: Any, default: bool) -> bool:
    if value is None:
        return default
    if isinstance(value, bool):
        return value
    if isinstance(value, str):
        return value.lower() in ("1", "true", "yes", "on")
    return bool(value)


def get_content_thresholds(capabilities: dict[str, Any] | None) -> ContentThresholds:
    """Parse content_change.thresholds from capabilities JSONB."""
    caps = capabilities or {}
    raw_cc = caps.get("content_change")
    if not isinstance(raw_cc, dict):
        raw_cc = {}
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        th = {}
    min_b = th.get("minChangeSizeBytes")
    if min_b is None:
        min_bytes = 0
    else:
        try:
            min_bytes = max(0, int(min_b))
        except (TypeError, ValueError):
            min_bytes = 0
    min_tl = th.get("minTotalDiffLines")
    if min_tl is None:
        min_total_lines = 0
    else:
        try:
            min_total_lines = max(0, int(min_tl))
        except (TypeError, ValueError):
            min_total_lines = 0
    alert = th.get("alertOnChange", True)
    if not isinstance(alert, bool):
        alert = bool(alert)
    return ContentThresholds(
        alert_on_change=alert,
        min_change_size_bytes=min_bytes,
        min_total_diff_lines=min_total_lines,
        normalize_volatile_tokens=_parse_bool_threshold(
            th.get("normalizeVolatileTokens"), True
        ),
        suppress_degraded_page_changes=_parse_bool_threshold(
            th.get("suppressDegradedPageChanges"), True
        ),
    )


def evaluate_content_threshold(
    diff_summary: dict[str, Any],
    change_size_bytes: int,
    thresholds: ContentThresholds,
) -> bool:
    """
    Return True if the change should be recorded (MonitorChange + alerts path).

    Uses byte delta and MIN_DIFF_LINES_OVERRIDE when min_change_size_bytes > 0.
    Optional min_total_diff_lines suppresses tiny diffs unless byte/line overrides apply.
    """
    if not thresholds.alert_on_change:
        return False
    total_lines = int(diff_summary.get("totalDiffLines", 0) or 0)
    min_lines_req = thresholds.min_total_diff_lines
    min_bytes = thresholds.min_change_size_bytes

    if min_lines_req > 0 and total_lines < min_lines_req:
        bypass = False
        if min_bytes > 0 and change_size_bytes >= min_bytes:
            bypass = True
        elif (
            min_bytes > 0 and total_lines >= settings.MIN_DIFF_LINES_OVERRIDE
        ):
            bypass = True
        if not bypass:
            return False

    if min_bytes <= 0:
        return True
    if change_size_bytes >= min_bytes:
        return True
    return total_lines >= settings.MIN_DIFF_LINES_OVERRIDE
