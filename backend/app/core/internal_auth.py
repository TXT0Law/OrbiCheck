"""HMAC authentication for Backend requests to internal services."""

from __future__ import annotations

import hashlib
import hmac
import time

import httpx

INTERNAL_TIMESTAMP_HEADER = "X-Orbi-Timestamp"
INTERNAL_SIGNATURE_HEADER = "X-Orbi-Signature"
SIGNATURE_VERSION = "v1"


def _request_target(request: httpx.Request) -> str:
    return request.url.raw_path.decode("ascii")


def _signature_payload(
    *,
    timestamp: str,
    method: str,
    target: str,
    body: bytes,
) -> bytes:
    body_digest = hashlib.sha256(body).hexdigest()
    return (
        f"{SIGNATURE_VERSION}\n{timestamp}\n{method.upper()}\n"
        f"{target}\n{body_digest}"
    ).encode()


def build_internal_auth_headers(
    *,
    secret: str,
    method: str,
    target: str,
    body: bytes = b"",
    timestamp: int | None = None,
) -> dict[str, str]:
    """Build replay-bounded request authentication headers."""

    normalized_secret = secret.strip()
    if not normalized_secret:
        return {}
    timestamp_text = str(timestamp if timestamp is not None else int(time.time()))
    signature = hmac.new(
        normalized_secret.encode(),
        _signature_payload(
            timestamp=timestamp_text,
            method=method,
            target=target,
            body=body,
        ),
        hashlib.sha256,
    ).hexdigest()
    return {
        INTERNAL_TIMESTAMP_HEADER: timestamp_text,
        INTERNAL_SIGNATURE_HEADER: f"{SIGNATURE_VERSION}={signature}",
    }


class InternalServiceAuth(httpx.Auth):
    """Sign each prepared HTTPX request with the configured shared secret."""

    requires_request_body = True

    def __init__(self, secret: str) -> None:
        self._secret = secret

    def auth_flow(self, request: httpx.Request):
        request.headers.update(
            build_internal_auth_headers(
                secret=self._secret,
                method=request.method,
                target=_request_target(request),
                body=request.content,
            )
        )
        yield request
