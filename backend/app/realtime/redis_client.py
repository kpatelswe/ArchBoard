import redis.asyncio as aioredis

from app.core.config import get_settings

_redis: aioredis.Redis | None = None


def get_redis() -> aioredis.Redis:
    """Shared lazy client for key-value work (presence, rate limits).

    The pub/sub bus keeps its own connection: a subscribed Redis connection
    is dedicated to listening and cannot serve regular commands.
    """
    global _redis
    if _redis is None:
        _redis = aioredis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis
