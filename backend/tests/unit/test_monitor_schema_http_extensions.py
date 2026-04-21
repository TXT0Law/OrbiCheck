"""Phase 1.1: Pydantic validation for new HTTP-extension fields."""

from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.api.v1.schemas.monitor import (
    MAX_REQUEST_BODY_BYTES,
    MAX_REQUEST_HEADERS_COUNT,
    MonitorCreateRequest,
    MonitorUpdateRequest,
)


def _base_payload(**overrides) -> dict:
    payload = {
        "displayName": "edge-monitor",
        "url": "https://example.com",
        "enabledCapabilities": ["uptime_only"],
        "intervalSeconds": 60,
        "httpMethod": "GET",
    }
    payload.update(overrides)
    return payload


@pytest.mark.unit
def test_create_accepts_minimal_payload() -> None:
    req = MonitorCreateRequest.model_validate(_base_payload())
    assert req.http_body is None
    assert req.http_headers is None
    assert req.http_auth is None


@pytest.mark.unit
def test_create_extended_methods_pass() -> None:
    for method in ("PUT", "PATCH", "DELETE", "OPTIONS"):
        req = MonitorCreateRequest.model_validate(
            _base_payload(httpMethod=method)
        )
        assert req.http_method == method


@pytest.mark.unit
def test_create_rejects_unknown_method() -> None:
    with pytest.raises(ValidationError):
        MonitorCreateRequest.model_validate(_base_payload(httpMethod="TRACE"))


@pytest.mark.unit
def test_create_rejects_body_for_get() -> None:
    with pytest.raises(ValidationError) as exc:
        MonitorCreateRequest.model_validate(
            _base_payload(httpMethod="GET", httpBody="hello")
        )
    assert "httpBody not allowed" in str(exc.value)


@pytest.mark.unit
def test_create_accepts_body_for_post() -> None:
    req = MonitorCreateRequest.model_validate(
        _base_payload(httpMethod="POST", httpBody='{"hello":"world"}')
    )
    assert req.http_body == '{"hello":"world"}'


@pytest.mark.unit
def test_create_rejects_body_above_byte_cap() -> None:
    too_big = "a" * (MAX_REQUEST_BODY_BYTES + 1)
    with pytest.raises(ValidationError) as exc:
        MonitorCreateRequest.model_validate(
            _base_payload(httpMethod="POST", httpBody=too_big)
        )
    assert "exceeds" in str(exc.value)


@pytest.mark.unit
def test_create_rejects_forbidden_header() -> None:
    with pytest.raises(ValidationError) as exc:
        MonitorCreateRequest.model_validate(
            _base_payload(httpHeaders={"Host": "evil.example.com"})
        )
    assert "reserved header" in str(exc.value).lower()


@pytest.mark.unit
def test_create_rejects_too_many_headers() -> None:
    headers = {f"X-H{n}": "v" for n in range(MAX_REQUEST_HEADERS_COUNT + 1)}
    with pytest.raises(ValidationError):
        MonitorCreateRequest.model_validate(_base_payload(httpHeaders=headers))


@pytest.mark.unit
def test_create_rejects_invalid_header_name() -> None:
    with pytest.raises(ValidationError):
        MonitorCreateRequest.model_validate(
            _base_payload(httpHeaders={"Bad Header With Space": "x"})
        )


@pytest.mark.unit
def test_create_rejects_header_value_with_newline() -> None:
    with pytest.raises(ValidationError):
        MonitorCreateRequest.model_validate(
            _base_payload(httpHeaders={"X-Inject": "value\r\nset-cookie: evil=1"})
        )


@pytest.mark.unit
def test_create_accepts_bearer_auth_with_token() -> None:
    req = MonitorCreateRequest.model_validate(
        _base_payload(httpAuth={"scheme": "bearer", "token": "abc"})
    )
    assert req.http_auth is not None
    assert req.http_auth.scheme == "bearer"
    assert req.http_auth.token == "abc"


@pytest.mark.unit
def test_create_auth_none_clears_token() -> None:
    req = MonitorCreateRequest.model_validate(
        _base_payload(httpAuth={"scheme": "none", "token": "ignored"})
    )
    assert req.http_auth is not None
    assert req.http_auth.scheme == "none"
    assert req.http_auth.token is None


@pytest.mark.unit
def test_create_rejects_blank_bearer_token() -> None:
    with pytest.raises(ValidationError):
        MonitorCreateRequest.model_validate(
            _base_payload(httpAuth={"scheme": "bearer", "token": "   "})
        )


@pytest.mark.unit
def test_update_allows_clear_flags() -> None:
    req = MonitorUpdateRequest.model_validate(
        {"clearHttpBody": True, "clearHttpHeaders": True}
    )
    assert req.clear_http_body is True
    assert req.clear_http_headers is True
