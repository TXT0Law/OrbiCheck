"""SSRF-safe outbound HTTP gateway for user-controlled destinations."""

from __future__ import annotations

import json
import os
from collections.abc import Mapping
from typing import Any
from urllib.parse import urljoin

import httpx

from app.utils.url_safety import resolve_public_url

DEFAULT_MAX_REDIRECTS = 5
DEFAULT_MAX_RESPONSE_BYTES = 5 * 1024 * 1024
REDIRECT_STATUS_CODES = frozenset({301, 302, 303, 307, 308})
SENSITIVE_REDIRECT_HEADERS = frozenset(
    {"authorization", "cookie", "proxy-authorization"}
)


class OutboundRequestBlocked(ValueError):
    """Raised before a disallowed outbound destination is contacted."""


class OutboundResponseTooLarge(httpx.RequestError):
    """Raised when an outbound response exceeds its configured byte cap."""


def _host_header(hostname: str, port: int, scheme: str) -> str:
    default_port = 443 if scheme == "https" else 80
    host = f"[{hostname}]" if ":" in hostname else hostname
    return host if port == default_port else f"{host}:{port}"


def _redirect_method(method: str, status_code: int) -> str:
    normalized = method.upper()
    if status_code == 303 and normalized != "HEAD":
        return "GET"
    if status_code in {301, 302} and normalized == "POST":
        return "GET"
    return normalized


async def _read_bounded_response(
    response: httpx.Response,
    *,
    max_response_bytes: int,
    truncate: bool,
) -> bytes:
    chunks: list[bytes] = []
    size = 0
    async for chunk in response.aiter_bytes():
        remaining = max_response_bytes - size
        if len(chunk) > remaining:
            if truncate:
                chunks.append(chunk[:remaining])
                break
            raise OutboundResponseTooLarge(
                f"Outbound response exceeds {max_response_bytes} bytes",
                request=response.request,
            )
        size += len(chunk)
        chunks.append(chunk)
    return b"".join(chunks)


async def request_safely(
    method: str,
    url: str,
    *,
    headers: Mapping[str, str] | None = None,
    content: bytes | str | None = None,
    json_body: Any | None = None,
    timeout: httpx.Timeout | float | None = None,
    require_https: bool = False,
    max_redirects: int = DEFAULT_MAX_REDIRECTS,
    max_response_bytes: int = DEFAULT_MAX_RESPONSE_BYTES,
    truncate_response: bool = False,
    transport: httpx.AsyncBaseTransport | None = None,
    pin_dns: bool | None = None,
) -> httpx.Response:
    """Send a request with DNS pinning and per-hop destination validation."""

    if max_redirects < 0:
        raise ValueError("max_redirects must be non-negative")
    if max_response_bytes <= 0:
        raise ValueError("max_response_bytes must be positive")
    if content is not None and json_body is not None:
        raise ValueError("content and json_body are mutually exclusive")

    request_content: bytes | str | None = content
    request_headers = {
        str(name): str(value)
        for name, value in (headers or {}).items()
    }
    if json_body is not None:
        request_content = json.dumps(
            json_body,
            ensure_ascii=False,
            separators=(",", ":"),
        ).encode("utf-8")
        request_headers.setdefault("Content-Type", "application/json")

    current_url = url
    current_method = method.upper()
    redirect_count = 0
    pytest_dns_pin_bypass = (
        bool(os.getenv("PYTEST_CURRENT_TEST"))
        and os.getenv("OUTBOUND_HTTP_DISABLE_DNS_PINNING", "").lower() == "true"
    )
    should_pin_dns = (
        pin_dns
        if pin_dns is not None
        else not pytest_dns_pin_bypass
    )

    async with httpx.AsyncClient(
        follow_redirects=False,
        timeout=timeout,
        transport=transport,
    ) as client:
        while True:
            try:
                resolved = resolve_public_url(
                    current_url,
                    require_https=require_https,
                )
            except ValueError as exc:
                raise OutboundRequestBlocked(str(exc)) from exc

            logical_url = httpx.URL(current_url)
            pinned_url = (
                logical_url.copy_with(
                    host=str(resolved.addresses[0]),
                    port=resolved.port,
                )
                if should_pin_dns
                else logical_url
            )
            hop_headers = dict(request_headers)
            hop_headers["Host"] = _host_header(
                resolved.hostname,
                resolved.port,
                logical_url.scheme,
            )
            extensions = {"sni_hostname": resolved.hostname}

            async with client.stream(
                current_method,
                pinned_url,
                headers=hop_headers,
                content=request_content,
                extensions=extensions,
            ) as streamed:
                response_content = await _read_bounded_response(
                    streamed,
                    max_response_bytes=max_response_bytes,
                    truncate=truncate_response,
                )
                status_code = streamed.status_code
                response_headers = streamed.headers

            logical_request = httpx.Request(
                current_method,
                logical_url,
                headers=request_headers,
                content=request_content,
            )
            response = httpx.Response(
                status_code=status_code,
                headers=response_headers,
                content=response_content,
                request=logical_request,
            )

            location = response.headers.get("location")
            if status_code not in REDIRECT_STATUS_CODES or not location:
                return response
            if redirect_count >= max_redirects:
                raise httpx.TooManyRedirects(
                    "Exceeded maximum allowed redirects",
                    request=logical_request,
                )

            next_url = urljoin(current_url, location)
            previous_origin = (
                logical_url.scheme,
                logical_url.host,
                logical_url.port,
            )
            next_logical_url = httpx.URL(next_url)
            next_origin = (
                next_logical_url.scheme,
                next_logical_url.host,
                next_logical_url.port,
            )
            if previous_origin != next_origin:
                request_headers = {
                    name: value
                    for name, value in request_headers.items()
                    if name.lower() not in SENSITIVE_REDIRECT_HEADERS
                }

            next_method = _redirect_method(current_method, status_code)
            if next_method != current_method:
                request_content = None
                request_headers.pop("Content-Type", None)
                request_headers.pop("Content-Length", None)
            current_method = next_method
            current_url = next_url
            redirect_count += 1
