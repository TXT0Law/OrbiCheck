from __future__ import annotations

import hmac
import time
from collections import defaultdict, deque
from collections.abc import Callable
from typing import Any

from fastapi import Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

from app.core.config import settings
from app.core.security import decode_session_token, is_auth_dev_bypass_enabled


SAFE_HTTP_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
CSRF_EXEMPT_PATHS = frozenset({"/api/v1/auth/login"})
API_PATH_PREFIX = "/api/v1/"


def _error_response(status_code: int, code: str, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={
            "status": "error",
            "error": {"code": code, "message": message},
        },
    )


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[..., Any]):
        response = await call_next(request)
        if not settings.SECURITY_HEADERS_ENABLED:
            return response

        response.headers["X-Content-Type-Options"] = "nosniff"
        response.headers["X-Frame-Options"] = "DENY"
        response.headers["Referrer-Policy"] = "same-origin"
        response.headers["X-XSS-Protection"] = "1; mode=block"
        response.headers["Content-Security-Policy"] = settings.SECURITY_HEADER_CSP
        if request.url.scheme == "https":
            response.headers["Strict-Transport-Security"] = (
                "max-age=31536000; includeSubDomains"
            )
        return response


class CsrfProtectionMiddleware(BaseHTTPMiddleware):
    async def dispatch(self, request: Request, call_next: Callable[..., Any]):
        if (
            is_auth_dev_bypass_enabled()
            or request.method in SAFE_HTTP_METHODS
            or request.url.path in CSRF_EXEMPT_PATHS
            or not request.url.path.startswith(API_PATH_PREFIX)
        ):
            return await call_next(request)

        session_token = request.cookies.get(settings.AUTH_COOKIE_NAME, "")
        if not session_token:
            return _error_response(401, "UNAUTHENTICATED", "Authentication required")

        try:
            session = decode_session_token(session_token)
        except ValueError:
            return _error_response(401, "UNAUTHENTICATED", "Authentication required")

        csrf_cookie = request.cookies.get(settings.AUTH_CSRF_COOKIE_NAME, "")
        csrf_header = request.headers.get("X-CSRF-Token", "")
        tokens_match = (
            bool(csrf_cookie)
            and bool(csrf_header)
            and hmac.compare_digest(csrf_cookie, csrf_header)
            and hmac.compare_digest(session.csrf_token, csrf_header)
        )
        if not tokens_match:
            return _error_response(403, "CSRF_INVALID", "CSRF token is missing or invalid")

        return await call_next(request)


class SimpleRateLimitMiddleware(BaseHTTPMiddleware):
    def __init__(self, app) -> None:
        super().__init__(app)
        self._requests: defaultdict[str, deque[float]] = defaultdict(deque)

    def _client_key(self, request: Request) -> str:
        forwarded_for = request.headers.get("x-forwarded-for", "")
        if forwarded_for:
            client_host = forwarded_for.split(",", 1)[0].strip()
        else:
            client_host = request.client.host if request.client else "unknown"
        return f"{client_host}:{request.url.path}"

    def _resolve_limit(self, request: Request) -> int:
        if request.url.path == "/api/v1/auth/login":
            return settings.RATE_LIMIT_AUTH_REQUESTS
        if request.url.path == "/api/v1/scans" and request.method == "POST":
            return settings.RATE_LIMIT_SCAN_CREATE_REQUESTS
        return settings.RATE_LIMIT_DEFAULT_REQUESTS

    async def dispatch(self, request: Request, call_next: Callable[..., Any]):
        window_seconds = max(1, int(settings.RATE_LIMIT_WINDOW_SECONDS))
        limit = max(1, int(self._resolve_limit(request)))
        bucket = self._requests[self._client_key(request)]
        now = time.monotonic()

        while bucket and now - bucket[0] >= window_seconds:
            bucket.popleft()

        if len(bucket) >= limit:
            retry_after = max(1, int(window_seconds - (now - bucket[0])))
            response = _error_response(
                429,
                "RATE_LIMITED",
                "Too many requests. Please try again later.",
            )
            response.headers["Retry-After"] = str(retry_after)
            return response

        bucket.append(now)
        return await call_next(request)
