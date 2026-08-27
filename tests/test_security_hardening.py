from types import SimpleNamespace

import pytest
from fastapi import HTTPException
from redis.exceptions import ConnectionError
from starlette.requests import Request

from core.rate_limit import RedisRateLimit


def _request() -> Request:
    return Request(
        {
            "type": "http",
            "method": "GET",
            "path": "/",
            "headers": [],
            "client": ("203.0.113.10", 1234),
        }
    )


async def test_rate_limit_returns_retry_after(monkeypatch):
    class FakeRedis:
        async def eval(self, *_args):
            return 3

    settings = SimpleNamespace(LIMIT=2, WINDOW=60, ENVIRONMENT="production")
    monkeypatch.setattr("core.rate_limit.get_settings", lambda: settings)

    async def fake_redis():
        return FakeRedis()

    monkeypatch.setattr("core.rate_limit.get_redis", fake_redis)
    limiter = RedisRateLimit("test", "LIMIT", "WINDOW")

    with pytest.raises(HTTPException) as caught:
        await limiter(_request())

    assert caught.value.status_code == 429
    assert int(caught.value.headers["Retry-After"]) >= 1


async def test_rate_limit_fails_closed_in_production(monkeypatch):
    class UnavailableRedis:
        async def eval(self, *_args):
            raise ConnectionError("unavailable")

    settings = SimpleNamespace(LIMIT=2, WINDOW=60, ENVIRONMENT="production")
    monkeypatch.setattr("core.rate_limit.get_settings", lambda: settings)

    async def fake_redis():
        return UnavailableRedis()

    monkeypatch.setattr("core.rate_limit.get_redis", fake_redis)
    limiter = RedisRateLimit("test", "LIMIT", "WINDOW")

    with pytest.raises(HTTPException) as caught:
        await limiter(_request())

    assert caught.value.status_code == 503


async def test_rate_limit_fails_open_during_local_development(monkeypatch):
    class UnavailableRedis:
        async def eval(self, *_args):
            raise ConnectionError("unavailable")

    settings = SimpleNamespace(LIMIT=2, WINDOW=60, ENVIRONMENT="development")
    monkeypatch.setattr("core.rate_limit.get_settings", lambda: settings)

    async def fake_redis():
        return UnavailableRedis()

    monkeypatch.setattr("core.rate_limit.get_redis", fake_redis)
    limiter = RedisRateLimit("test", "LIMIT", "WINDOW")

    await limiter(_request())
