"""Unit tests for CSS selector text extraction (BeautifulSoup)."""

from __future__ import annotations

import pytest

from app.core.config import settings as app_settings
from app.services.content_selector_extraction import (
    SelectorValidationError,
    extract_for_content_pipeline,
    extract_inner_text_concat_ordered,
    extract_with_jsonpath,
    extract_with_xpath,
    get_selector_extraction_config,
    validate_selectors_against_html,
)


@pytest.mark.unit
def test_concat_ordered_merge() -> None:
    html = "<html><body><div id='a'>Hello</div><p class='x'>World</p></body></html>"
    text = extract_inner_text_concat_ordered(
        html,
        ("#a", "p.x"),
        max_chars=10_000,
    )
    assert "Hello" in text
    assert "World" in text


@pytest.mark.unit
def test_invalid_selector_syntax() -> None:
    with pytest.raises(SelectorValidationError) as ei:
        extract_inner_text_concat_ordered("<html/>", ("[[[",), max_chars=1000)
    assert ei.value.code == "INVALID_SELECTOR"


@pytest.mark.unit
def test_too_many_nodes_rejected() -> None:
    html = "<html><body>" + "".join(f"<span>{i}</span>" for i in range(5000)) + "</body></html>"
    with pytest.raises(SelectorValidationError) as ei:
        extract_inner_text_concat_ordered(html, ("span",), max_chars=1_000_000)
    assert ei.value.code == "SELECTOR_TOO_MANY_MATCHES"


@pytest.mark.unit
def test_get_config_disabled_when_flag_off(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_settings, "CONTENT_SELECTOR_EXTRACTION_ENABLED", False)
    caps = {
        "content_change": {
            "thresholds": {
                "selectorExtraction": {"selectors": ["body"], "mergeStrategy": "concat_ordered"}
            }
        }
    }
    assert get_selector_extraction_config(caps) is None


@pytest.mark.unit
def test_validate_empty_extraction(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(app_settings, "CONTENT_SELECTOR_EXTRACTION_ENABLED", True)
    html = "<html><body><p>x</p></body></html>"
    with pytest.raises(SelectorValidationError) as ei:
        validate_selectors_against_html(html, ("#missing",), max_chars=10_000)
    assert ei.value.code == "NO_SELECTOR_MATCH"


@pytest.mark.unit
def test_extract_with_xpath_simple_expression() -> None:
    html = "<html><body><article><h1>Title</h1></article></body></html>"
    assert extract_with_xpath(html, "//h1", max_chars=10_000) == "Title"


@pytest.mark.unit
def test_extract_with_jsonpath_values() -> None:
    body = '{"items":[{"title":"One"},{"title":"Two"}]}'
    assert extract_with_jsonpath(body, "$.items[*].title", max_chars=10_000) == "One\nTwo"


@pytest.mark.unit
def test_extract_for_content_pipeline_uses_ordered_extractors(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    monkeypatch.setattr(app_settings, "CONTENT_SELECTOR_EXTRACTION_ENABLED", True)
    cfg = get_selector_extraction_config(
        {
            "content_change": {
                "thresholds": {
                    "extractors": [
                        {"type": "jsonpath", "expression": "$.product.name"},
                        {"type": "jsonpath", "expression": "$.product.status"},
                    ]
                }
            }
        }
    )
    assert cfg is not None
    body = '{"product":{"name":"Widget","status":"In stock"}}'
    assert extract_for_content_pipeline(body, cfg) == "Widget\nIn stock"
