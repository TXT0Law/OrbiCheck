from collections.abc import AsyncGenerator

from fastapi import Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.core.exceptions import AppException
from app.core.security import decode_session_token, is_auth_dev_bypass_enabled
from app.db.session import async_session_factory


DEV_BYPASS_USER_ID = 1
DEV_BYPASS_EMAIL = "local@orbicheck.dev"
DEV_BYPASS_CSRF_TOKEN = "development-bypass"


class CurrentUser:
    """Authenticated caller derived from the signed session cookie."""

    __slots__ = ("id", "email", "csrf_token")

    def __init__(self, id: int, email: str, csrf_token: str) -> None:
        self.id = id
        self.email = email
        self.csrf_token = csrf_token


async def get_current_user(request: Request) -> CurrentUser:
    if is_auth_dev_bypass_enabled():
        return CurrentUser(
            id=DEV_BYPASS_USER_ID,
            email=settings.AUTH_LOGIN_EMAIL.strip().lower() or DEV_BYPASS_EMAIL,
            csrf_token=DEV_BYPASS_CSRF_TOKEN,
        )

    session_token = request.cookies.get(settings.AUTH_COOKIE_NAME, "")
    if not session_token:
        raise AppException(
            code="UNAUTHENTICATED",
            message="Authentication required",
            status_code=401,
        )

    try:
        session = decode_session_token(session_token)
    except ValueError as exc:
        raise AppException(
            code="UNAUTHENTICATED",
            message="Authentication required",
            status_code=401,
        ) from exc

    return CurrentUser(
        id=session.user_id,
        email=session.email,
        csrf_token=session.csrf_token,
    )


async def get_db() -> AsyncGenerator[AsyncSession, None]:
    """
    Provide a transactional DB session.
    Callers must explicitly call await db.commit() to persist changes.
    Rolls back automatically on unhandled exceptions.
    """
    async with async_session_factory() as session:
        try:
            yield session
        except Exception:
            await session.rollback()
            raise


async def get_redis() -> AsyncGenerator[Redis, None]:
    redis = Redis.from_url(settings.REDIS_URL, decode_responses=True)
    try:
        yield redis
    finally:
        await redis.aclose()
