"""CSS selector–scoped inner-text extraction for content_change (BeautifulSoup).

Security: HTML is parsed with html.parser only; scripts/styles are skipped when walking
matched nodes. No JS execution.

SSR note: server-side HTML only — client-rendered SPAs may yield empty or partial
matches until the shell contains the target markup.
"""

from __future__ import annotations

import json
import re
from dataclasses import dataclass
from typing import Any, Literal

from bs4 import BeautifulSoup
from bs4.element import Tag

from app.core.config import settings

MergeStrategy = Literal["concat_ordered"]
ExtractorType = Literal["css", "xpath", "jsonpath"]
_SIMPLE_XPATH_RE = re.compile(
    r"^//(?P<tag>[A-Za-z][\w:-]*|\*)(?:\[@(?P<attr>[\w:-]+)=['\"](?P<value>[^'\"]+)['\"]\])?(?P<text>/text\(\))?$"
)
_JSONPATH_TOKEN_RE = re.compile(r"\.([A-Za-z_][\w-]*)|(\[\*\])|\[['\"]([^'\"]+)['\"]\]")


@dataclass(frozen=True)
class ContentExtractor:
    type: ExtractorType
    expression: str


@dataclass(frozen=True)
class SelectorExtractionConfig:
    """Parsed content_change.thresholds.selectorExtraction block."""

    selectors: tuple[str, ...]
    extractors: tuple[ContentExtractor, ...]
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
        block = {}
    raw_sel = block.get("selectors")
    selectors: list[str] = []
    if isinstance(raw_sel, list):
        cap_n = min(len(raw_sel), settings.CONTENT_SELECTOR_MAX_COUNT)
        for s in raw_sel[:cap_n]:
            if isinstance(s, str) and s.strip():
                selectors.append(s.strip())
    raw_extractors = th.get("extractors")
    extractors: list[ContentExtractor] = []
    if isinstance(raw_extractors, list):
        cap_n = min(len(raw_extractors), settings.CONTENT_SELECTOR_MAX_COUNT)
        for item in raw_extractors[:cap_n]:
            if not isinstance(item, dict):
                continue
            typ = item.get("type")
            expression = item.get("expression")
            if typ in {"css", "xpath", "jsonpath"} and isinstance(expression, str) and expression.strip():
                extractors.append(ContentExtractor(type=typ, expression=expression.strip()))
    if not selectors and not extractors:
        return None
    merge = block.get("mergeStrategy", "concat_ordered")
    if merge != "concat_ordered":
        merge = "concat_ordered"
    max_chars = int(block.get("maxExtractedChars", settings.CONTENT_SELECTOR_MAX_EXTRACTED_CHARS))
    max_chars = max(1024, min(max_chars, settings.CONTENT_SELECTOR_MAX_EXTRACTED_CHARS))
    return SelectorExtractionConfig(
        selectors=tuple(selectors),
        extractors=tuple(extractors),
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


def extract_with_xpath(html: str, expression: str, *, max_chars: int) -> str:
    """Extract text using a safe subset of XPath, with lxml when available."""
    try:
        from lxml import html as lxml_html  # type: ignore[import-not-found]
    except ImportError:
        lxml_html = None
    if lxml_html is not None:
        try:
            root = lxml_html.fromstring(html)
            values = root.xpath(expression)
        except Exception as exc:
            raise SelectorValidationError("INVALID_XPATH", f"Invalid XPath extractor: {exc}") from exc
        parts: list[str] = []
        for value in values[: settings.CONTENT_SELECTOR_MAX_NODES_PER_SELECTOR]:
            if isinstance(value, str):
                parts.append(value)
            elif hasattr(value, "text_content"):
                parts.append(value.text_content())
        return _strip_and_join(parts, max_chars)

    match = _SIMPLE_XPATH_RE.match(expression.strip())
    if not match:
        raise SelectorValidationError(
            "XPATH_UNSUPPORTED",
            "XPath extractor requires lxml for this expression",
        )
    tag = match.group("tag")
    attr = match.group("attr")
    value = match.group("value")
    soup = BeautifulSoup(html, "html.parser")
    for node in soup(["script", "style"]):
        node.decompose()
    found = soup.find_all(True if tag == "*" else tag, limit=settings.CONTENT_SELECTOR_MAX_NODES_PER_SELECTOR + 1)
    parts: list[str] = []
    for node in found:
        if attr and node.get(attr) != value:
            continue
        parts.append(node.get_text(separator="\n", strip=True))
    return _strip_and_join(parts, max_chars)


def _jsonpath_values(data: Any, expression: str) -> list[Any]:
    if not expression.startswith("$"):
        raise SelectorValidationError("INVALID_JSONPATH", "JSONPath must start with '$'")
    current: list[Any] = [data]
    pos = 1
    while pos < len(expression):
        match = _JSONPATH_TOKEN_RE.match(expression, pos)
        if match is None:
            raise SelectorValidationError("INVALID_JSONPATH", "Unsupported JSONPath expression")
        key = match.group(1) or match.group(3)
        is_wildcard = match.group(2) is not None
        next_values: list[Any] = []
        if is_wildcard:
            for item in current:
                if isinstance(item, list):
                    next_values.extend(item)
            current = next_values
        else:
            for item in current:
                if isinstance(item, dict) and key in item:
                    next_values.append(item[key])
            current = next_values
        pos = match.end()
    return current


def extract_with_jsonpath(body: str, expression: str, *, max_chars: int) -> str:
    """Extract primitive values from JSON using a bounded JSONPath subset."""
    try:
        data = json.loads(body)
    except json.JSONDecodeError as exc:
        raise SelectorValidationError("INVALID_JSON", f"Body is not valid JSON: {exc.msg}") from exc
    try:
        from jsonpath_ng import parse as parse_jsonpath
    except ImportError:
        parse_jsonpath = None
    if parse_jsonpath is not None:
        try:
            matches = parse_jsonpath(expression).find(data)
        except Exception as exc:
            raise SelectorValidationError("INVALID_JSONPATH", f"Invalid JSONPath extractor: {exc}") from exc
        values = [match.value for match in matches[: settings.CONTENT_SELECTOR_MAX_NODES_PER_SELECTOR]]
    else:
        values = _jsonpath_values(data, expression)[: settings.CONTENT_SELECTOR_MAX_NODES_PER_SELECTOR]
    parts: list[str] = []
    for value in values:
        if isinstance(value, (str, int, float, bool)) or value is None:
            parts.append("" if value is None else str(value))
        else:
            parts.append(json.dumps(value, ensure_ascii=False, sort_keys=True))
    return _strip_and_join(parts, max_chars)


def extract_with_config(body: str, config: SelectorExtractionConfig) -> str:
    parts: list[str] = []
    if config.selectors:
        css_text = extract_inner_text_concat_ordered(
            body,
            config.selectors,
            max_chars=config.max_extracted_chars,
        )
        if css_text:
            parts.append(css_text)
    for extractor in config.extractors:
        if extractor.type == "css":
            text = extract_inner_text_concat_ordered(
                body,
                (extractor.expression,),
                max_chars=config.max_extracted_chars,
            )
        elif extractor.type == "xpath":
            text = extract_with_xpath(body, extractor.expression, max_chars=config.max_extracted_chars)
        else:
            text = extract_with_jsonpath(body, extractor.expression, max_chars=config.max_extracted_chars)
        if text:
            parts.append(text)
    return _strip_and_join(parts, config.max_extracted_chars)


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
    text = extract_with_config(html, config)
    return text if text else ""
