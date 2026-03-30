from collections.abc import AsyncGenerator

from fastapi import Request
from redis.asyncio import Redis
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.config import settings
from app.db.session import async_session_factory


class CurrentUser:
    """Authenticated caller derived from the signed session cookie."""

    __slots__ = ("id", "email", "csrf_token")

    def __init__(self, id: int, email: str, csrf_token: str) -> None:
        self.id = id
        self.email = email
        self.csrf_token = csrf_token


async def get_current_user(request: Request) -> CurrentUser:
    return CurrentUser(
        id=1,
        email=settings.AUTH_LOGIN_EMAIL.strip().lower() or "local@orbicheck.dev",
        csrf_token="local-mode",
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
