import json
import secrets

import redis.asyncio as aioredis

from core.settings import get_settings

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        settings = get_settings()
        _pool = aioredis.from_url(
            settings.REDIS_URL,
            decode_responses=True,
            socket_connect_timeout=settings.REDIS_CONNECT_TIMEOUT_SECONDS,
            socket_timeout=settings.REDIS_SOCKET_TIMEOUT_SECONDS,
            health_check_interval=30,
        )
    return _pool


async def cache_get(key: str) -> dict | None:
    r = await get_redis()
    data = await r.get(key)
    if data:
        return json.loads(data)
    return None


async def cache_set(key: str, value: dict, ttl_seconds: int = 86400) -> None:
    r = await get_redis()
    await r.set(key, json.dumps(value, ensure_ascii=False), ex=ttl_seconds)


async def cache_acquire_lock(key: str, ttl_seconds: int = 10) -> str | None:
    """Acquire a token-owned Redis lock; returns None when another caller owns it."""
    token = secrets.token_urlsafe(18)
    r = await get_redis()
    acquired = await r.set(f"lock:{key}", token, nx=True, ex=ttl_seconds)
    return token if acquired else None


async def cache_release_lock(key: str, token: str) -> None:
    r = await get_redis()
    await r.eval(
        """
        if redis.call('get', KEYS[1]) == ARGV[1] then
            return redis.call('del', KEYS[1])
        end
        return 0
        """,
        1,
        f"lock:{key}",
        token,
    )


async def close_redis() -> None:
    global _pool
    if _pool is not None:
        await _pool.aclose()
        _pool = None
