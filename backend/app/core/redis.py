from redis.asyncio import Redis

from app.core.config import settings


def get_redis_sync():
    """Synchronous Redis client for Celery tasks."""
    import redis

    return redis.Redis.from_url(settings.REDIS_URL, decode_responses=True)


async def get_redis_async() -> Redis:
    """Async Redis client for FastAPI endpoints."""
    return Redis.from_url(settings.REDIS_URL, decode_responses=True)
