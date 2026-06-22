import json

import redis.asyncio as aioredis

from core.settings import get_settings

_pool: aioredis.Redis | None = None


async def get_redis() -> aioredis.Redis:
    global _pool
    if _pool is None:
        _pool = aioredis.from_url(
            get_settings().REDIS_URL,
            decode_responses=True,
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
