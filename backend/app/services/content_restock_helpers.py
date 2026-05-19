"""Restock / in-stock detection helpers for content_change monitors."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

MAX_RESTOCK_KEYWORDS = 32
MAX_RESTOCK_KEYWORD_LENGTH = 200


@dataclass(frozen=True)
class RestockConfig:
    enabled: bool
    out_of_stock_keywords: tuple[str, ...]
    in_stock_keywords: tuple[str, ...]


def _clean_words(raw: Any) -> tuple[str, ...]:
    if not isinstance(raw, list):
        return ()
    out: list[str] = []
    for item in raw[:MAX_RESTOCK_KEYWORDS]:
        if not isinstance(item, str):
            continue
        word = item.strip()
        if not word:
            continue
        out.append(word[:MAX_RESTOCK_KEYWORD_LENGTH].lower())
    return tuple(out)


def get_content_restock_config(capabilities: dict[str, Any] | None) -> RestockConfig | None:
    caps = capabilities or {}
    raw_cc = caps.get("content_change")
    if not isinstance(raw_cc, dict):
        return None
    th = raw_cc.get("thresholds")
    if not isinstance(th, dict):
        return None
    restock = th.get("restock")
    if not isinstance(restock, dict) or not bool(restock.get("enabled", False)):
        return None
    oos = _clean_words(restock.get("outOfStockKeywords"))
    instock = _clean_words(restock.get("inStockKeywords"))
    if not oos or not instock:
        return None
    return RestockConfig(
        enabled=True,
        out_of_stock_keywords=oos,
        in_stock_keywords=instock,
    )


def detect_restock_transition(
    previous_text: str,
    current_text: str,
    config: RestockConfig | None,
) -> tuple[bool, str | None]:
    if config is None:
        return False, None
    prev = previous_text.lower()
    cur = current_text.lower()
    had_oos = any(word in prev for word in config.out_of_stock_keywords)
    matched = next((word for word in config.in_stock_keywords if word in cur), None)
    return bool(had_oos and matched), matched
