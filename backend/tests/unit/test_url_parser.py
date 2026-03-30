"""Unit tests for normalize_url."""

import pytest

from app.utils.url_parser import normalize_url


@pytest.mark.unit
def test_no_scheme_adds_https() -> None:
    assert normalize_url("example.com") == "https://example.com"
    assert normalize_url("EXAMPLE.COM") == "https://example.com"


@pytest.mark.unit
def test_scheme_and_host_lowercase() -> None:
    assert normalize_url("HTTPS://Example.COM") == "https://example.com"
    assert normalize_url("http://Example.COM/Path") == "http://example.com/Path"


@pytest.mark.unit
def test_trailing_slash_removed() -> None:
    assert normalize_url("https://example.com/") == "https://example.com"
    assert normalize_url("https://example.com/path/") == "https://example.com/path"


@pytest.mark.unit
def test_default_port_removed() -> None:
    assert normalize_url("https://example.com:443/") == "https://example.com"
    assert normalize_url("http://example.com:80/") == "http://example.com"


@pytest.mark.unit
def test_non_default_port_preserved() -> None:
    assert normalize_url("https://example.com:8443/") == "https://example.com:8443"


@pytest.mark.unit
def test_fragment_removed() -> None:
    assert normalize_url("https://example.com#section") == "https://example.com"
    assert normalize_url("https://example.com/path#anchor") == "https://example.com/path"


@pytest.mark.unit
def test_empty_or_invalid_returns_empty() -> None:
    assert normalize_url("") == ""
    assert normalize_url("   ") == ""


@pytest.mark.unit
def test_path_and_query_preserved() -> None:
    url = "https://example.com/api/v1?foo=bar&baz=1"
    assert normalize_url(url) == "https://example.com/api/v1?foo=bar&baz=1"
