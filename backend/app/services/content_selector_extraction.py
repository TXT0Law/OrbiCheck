"""CSS selector–scoped inner-text extraction for content_change (BeautifulSoup).

Security: HTML is parsed with html.parser only; scripts/styles are skipped when walking
matched nodes. No JS execution.

SSR note: server-side HTML only — client-rendered SPAs may yield empty or partial
matches until the shell contains the target markup.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Literal

from bs4 import BeautifulSoup
from bs4.element import Tag

from app.core.config import settings

MergeStrategy = Literal["concat_ordered"]


@dataclass(frozen=True)
class SelectorExtractionConfig:
    """Parsed content_change.thresholds.selectorExtraction block."""

    selectors: tuple[str, ...]
    merge_strategy: MergeStrategy
    max_extracted_chars: int


class SelectorValidationError(Exception):
    """Raised when selectors are invalid or violate bounds (maps to HTTP 422)."""

    def __init__(self, code: str, message: str) -> None:
        self.code = code
        super().__init__(message)


def get_selector_extraction_config(
    capabilities: dict[str, Any] | None,
) -> SelectorExtractionConfig | None:
    """Return config when feature flag + selectors are present and valid shape."""
    if not settings.CONTENT_SELECTOR_EXTRACTION_ENABLED:
        return None
    caps = capabilities or {}
    raw_cc = caps.get("content_change")
    if not isinstance(raw_cc, dict):
        return None
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        return None
    block = th.get("selectorExtraction")
    if not isinstance(block, dict):
        return None
    raw_sel = block.get("selectors")
    if not isinstance(raw_sel, list) or not raw_sel:
        return None
    selectors: list[str] = []
    cap_n = min(len(raw_sel), settings.CONTENT_SELECTOR_MAX_COUNT)
    for s in raw_sel[:cap_n]:
        if isinstance(s, str) and s.strip():
            selectors.append(s.strip())
    if not selectors:
        return None
    merge = block.get("mergeStrategy", "concat_ordered")
    if merge != "concat_ordered":
        merge = "concat_ordered"
    max_chars = int(block.get("maxExtractedChars", settings.CONTENT_SELECTOR_MAX_EXTRACTED_CHARS))
    max_chars = max(1024, min(max_chars, settings.CONTENT_SELECTOR_MAX_EXTRACTED_CHARS))
    return SelectorExtractionConfig(
        selectors=tuple(selectors),
        merge_strategy="concat_ordered",
        max_extracted_chars=max_chars,
    )


def _strip_and_join(parts: list[str], max_chars: int) -> str:
    out: list[str] = []
    total = 0
    for p in parts:
        chunk = p.strip()
        if not chunk:
            continue
        if total + len(chunk) + 1 > max_chars:
            remain = max_chars - total - 1
            if remain > 0:
                out.append(chunk[:remain])
            break
        out.append(chunk)
        total += len(chunk) + 1
    return "\n".join(out)


def extract_inner_text_concat_ordered(html: str, selectors: tuple[str, ...], *, max_chars: int) -> str:
    """
    For each selector in order, select matching elements in document order; for each
    element, append stripped inner text (script/style subtrees excluded). Blocks from
    different selectors are separated by a blank line.
    """
    soup = BeautifulSoup(html, "html.parser")
    for tag in soup(["script", "style"]):
        tag.decompose()
    blocks: list[str] = []
    for sel in selectors:
        try:
            nodes = soup.select(sel)
        except Exception as exc:
            raise SelectorValidationError("INVALID_SELECTOR", f"Invalid CSS selector: {exc}") from exc
        if len(nodes) > settings.CONTENT_SELECTOR_MAX_NODES_PER_SELECTOR:
            raise SelectorValidationError(
                "SELECTOR_TOO_MANY_MATCHES",
                f"Selector matches too many nodes (>{settings.CONTENT_SELECTOR_MAX_NODES_PER_SELECTOR})",
            )
        for node in nodes:
            if not isinstance(node, Tag):
                continue
            block = node.get_text(separator="\n", strip=True)
            if block:
                blocks.append(block)
    merged = "\n\n".join(blocks) if blocks else ""
    if len(merged) > max_chars:
        merged = merged[:max_chars]
    return merged


def validate_selectors_against_html(
    html: str,
    selectors: tuple[str, ...],
    *,
    max_chars: int,
) -> None:
    """Dry-run: zero matches or too many matches per selector → SelectorValidationError."""
    if not html.strip():
        raise SelectorValidationError("EMPTY_HTML", "No HTML body to validate selectors")
    text = extract_inner_text_concat_ordered(html, selectors, max_chars=max_chars)
    if not text.strip():
        raise SelectorValidationError(
            "NO_SELECTOR_MATCH",
            "Selectors matched no nodes or produced empty text",
        )


def extract_for_content_pipeline(
    html: str,
    config: SelectorExtractionConfig | None,
) -> str:
    """Return scoped text or original HTML when config is None."""
    if config is None:
        return html
    text = extract_inner_text_concat_ordered(
        html, config.selectors, max_chars=config.max_extracted_chars
    )
    return text if text else ""
