from __future__ import annotations

from fastapi import APIRouter, Depends, Response

from app.api.v1.schemas.auth import LoginRequest, SessionResponse
from app.api.v1.schemas.common import SuccessResponse
from app.core.config import settings
from app.core.deps import CurrentUser, get_current_user
from app.core.exceptions import AppException
from app.core.security import create_session_token, validate_login_credentials

router = APIRouter(prefix="/auth", tags=["auth"])


def _set_auth_cookies(response: Response, *, session_token: str, csrf_token: str) -> None:
    common_kwargs = {
        "max_age": settings.AUTH_SESSION_TTL_SECONDS,
        "path": "/",
        "secure": settings.AUTH_COOKIE_SECURE,
        "samesite": settings.AUTH_COOKIE_SAMESITE,
    }
    if settings.AUTH_COOKIE_DOMAIN:
        common_kwargs["domain"] = settings.AUTH_COOKIE_DOMAIN

    response.set_cookie(
        key=settings.AUTH_COOKIE_NAME,
        value=session_token,
        httponly=True,
        **common_kwargs,
    )
    response.set_cookie(
        key=settings.AUTH_CSRF_COOKIE_NAME,
        value=csrf_token,
        httponly=False,
        **common_kwargs,
    )


def _clear_auth_cookies(response: Response) -> None:
    delete_kwargs = {
        "path": "/",
    }
    if settings.AUTH_COOKIE_DOMAIN:
        delete_kwargs["domain"] = settings.AUTH_COOKIE_DOMAIN

    response.delete_cookie(settings.AUTH_COOKIE_NAME, **delete_kwargs)
    response.delete_cookie(settings.AUTH_CSRF_COOKIE_NAME, **delete_kwargs)


@router.post("/login", response_model=SuccessResponse[SessionResponse])
async def login(
    body: LoginRequest,
    response: Response,
) -> SuccessResponse[SessionResponse]:
    try:
        session = validate_login_credentials(body.email, body.password)
    except ValueError as exc:
        message = str(exc)
        if "not configured" in message:
            raise AppException(
                code="AUTH_NOT_CONFIGURED",
                message="Authentication is not configured on the server",
                status_code=503,
            ) from exc
        raise AppException(
            code="INVALID_CREDENTIALS",
            message="Invalid email or password",
            status_code=401,
        ) from exc

    try:
        session_token = create_session_token(
            user_id=session.user_id,
            email=session.email,
            csrf_token=session.csrf_token,
        )
    except ValueError as exc:
        raise AppException(
            code="AUTH_NOT_CONFIGURED",
            message="Authentication is not configured on the server",
            status_code=503,
        ) from exc
    _set_auth_cookies(
        response,
        session_token=session_token,
        csrf_token=session.csrf_token,
    )
    return SuccessResponse(
        data=SessionResponse(authenticated=True, email=session.email)
    )


@router.post("/logout", response_model=SuccessResponse[dict[str, bool]])
async def logout(
    response: Response,
    current_user: CurrentUser = Depends(get_current_user),
) -> SuccessResponse[dict[str, bool]]:
    _ = current_user
    _clear_auth_cookies(response)
    return SuccessResponse(data={"ok": True})


@router.get("/session", response_model=SuccessResponse[SessionResponse])
async def get_session(
    current_user: CurrentUser = Depends(get_current_user),
) -> SuccessResponse[SessionResponse]:
    return SuccessResponse(
        data=SessionResponse(authenticated=True, email=current_user.email)
    )
