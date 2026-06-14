import asyncio
import time
from functools import wraps

from loguru import logger


def timer_logger(func):
    if asyncio.iscoroutinefunction(func):
        @wraps(func)
        async def async_wrapper(*args, **kwargs):
            start = time.perf_counter()
            try:
                return await func(*args, **kwargs)
            finally:
                elapsed = time.perf_counter() - start
                logger.debug(f"{func.__name__} took {elapsed:.4f}s")
        return async_wrapper

    @wraps(func)
    def sync_wrapper(*args, **kwargs):
        start = time.perf_counter()
        try:
            return func(*args, **kwargs)
        finally:
            elapsed = time.perf_counter() - start
            logger.debug(f"{func.__name__} took {elapsed:.4f}s")
    return sync_wrapper
