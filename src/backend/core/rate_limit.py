import hashlib
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status
from loguru import logger
from redis.exceptions import RedisError

from core.settings import get_settings
from integrations.cache import get_redis

_FIXED_WINDOW_SCRIPT = """
local count = redis.call('INCR', KEYS[1])
if count == 1 then
    redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
"""


@dataclass(frozen=True, slots=True)
class RedisRateLimit:
    scope: str
    requests_setting: str
    window_setting: str

    async def __call__(self, request: Request) -> None:
        settings = get_settings()
        limit = int(getattr(settings, self.requests_setting))
        window = int(getattr(settings, self.window_setting))
        if limit <= 0 or window <= 0:
            return

        user_id = getattr(request.state, "user_id", None)
        identity = (
            f"user:{user_id}"
            if user_id is not None
            else f"ip:{request.client.host if request.client else 'unknown'}"
        )
        client_key = hashlib.sha256(identity.encode()).hexdigest()[:24]
        now = int(time.time())
        bucket = now // window
        key = f"rate_limit:v1:{self.scope}:{client_key}:{bucket}"
        try:
            redis = await get_redis()
            count = int(await redis.eval(_FIXED_WINDOW_SCRIPT, 1, key, window + 1))
        except RedisError as exc:
            logger.warning(
                "Rate limit backend unavailable scope={} error={}",
                self.scope,
                type(exc).__name__,
            )
            if settings.ENVIRONMENT == "production":
                raise HTTPException(
                    status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
                    detail="Rate limit service unavailable",
                ) from exc
            return

        if count > limit:
            retry_after = max(1, window - now % window)
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests",
                headers={"Retry-After": str(retry_after)},
            )


auth_rate_limit = RedisRateLimit(
    "auth", "AUTH_RATE_LIMIT_REQUESTS", "AUTH_RATE_LIMIT_WINDOW_SECONDS"
)
search_rate_limit = RedisRateLimit(
    "search", "SEARCH_RATE_LIMIT_REQUESTS", "SEARCH_RATE_LIMIT_WINDOW_SECONDS"
)
acquire_rate_limit = RedisRateLimit(
    "acquire", "ACQUIRE_RATE_LIMIT_REQUESTS", "ACQUIRE_RATE_LIMIT_WINDOW_SECONDS"
)
