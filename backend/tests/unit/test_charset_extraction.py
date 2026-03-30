"""Unit tests for charset extraction from responses."""

from __future__ import annotations

import httpx

from app.services.content_change_helpers import extract_charset


def test_extract_charset_from_content_type_header() -> None:
    r = httpx.Response(200, headers={"content-type": 'Text/HTML; charset="utf-8"'})
    assert extract_charset(r.headers.get("content-type", ""), r) == "utf-8"


def test_extract_charset_fallback_encoding() -> None:
    r = httpx.Response(200, headers={"content-type": "text/html"})
    r.encoding = "latin-1"
    assert extract_charset("text/html", r) == "latin-1"


def test_extract_charset_default_utf8() -> None:
    r = httpx.Response(200, headers={})
    r.encoding = None
    assert extract_charset("", r) == "utf-8"
