from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from importlib.metadata import PackageNotFoundError, version
import re
from uuid import uuid4

import uvicorn
from authx import JWTDecodeError
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger
from sqlalchemy import text

from core.exceptions import AppException
from core.modules import register_modules
from core.security import jwt_security
from core.settings import get_settings
from database.engine import create_engine_and_sessionmaker
from integrations import close_integrations
from integrations.cache import get_redis
from integrations.storage import ensure_bucket, storage_ready
from modules.admin.service import ConfigService, setup_required

try:
    __version__ = version("fuze")
except PackageNotFoundError:
    __version__ = "0.1.0"


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    engine, session_maker = create_engine_and_sessionmaker(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
    )
    app.state.engine = engine
    app.state.session_maker = session_maker

    try:
        await ensure_bucket()
    except Exception as exc:
        logger.warning("Object storage is not ready at startup: {}", type(exc).__name__)

    yield

    await close_integrations()
    await engine.dispose()
    logger.info("Database engine disposed")


settings = get_settings()
REQUEST_ID_PATTERN = re.compile(r"^[A-Za-z0-9._:-]{1,128}$")
app = FastAPI(
    lifespan=lifespan,
    title="fuze",
    docs_url=settings.SWAGGER_PATH,
    redoc_url=settings.REDOC_PATH,
)

jwt_security.handle_errors(app)


@app.exception_handler(JWTDecodeError)
async def jwt_decode_error_handler(request: Request, exc: JWTDecodeError):
    return JSONResponse(
        status_code=401,
        content={"message": "Invalid Token", "error_type": type(exc).__name__},
    )

register_modules(app, prefix=settings.API_PREFIX)


@app.get(f"{settings.API_PREFIX}/config", tags=["config"])
async def public_config():
    async with app.state.session_maker() as session:
        service = ConfigService(session)
        snapshot = await service.get_snapshot()
        config = snapshot.config
        needs_setup = await setup_required(session)
    return {
        "instance_name": config.instance_name,
        "setup_required": needs_setup,
        "auth": {
            "mode": config.auth.mode,
            "registration": config.auth.registration,
        },
        "features": {"playback": config.features.playback},
        "providers": {
            "youtube": config.providers.youtube,
            "yandex": config.providers.yandex,
            "spotify": config.providers.spotify,
        },
    }

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)


@app.middleware("http")
async def request_context(request: Request, call_next):
    supplied_request_id = request.headers.get("X-Request-ID", "")
    request_id = (
        supplied_request_id
        if REQUEST_ID_PATTERN.fullmatch(supplied_request_id)
        else str(uuid4())
    )
    request.state.request_id = request_id
    response = await call_next(request)
    response.headers["X-Request-ID"] = request_id
    return response


@app.exception_handler(AppException)
async def app_exception_handler(request: Request, exc: AppException):
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.opt(exception=exc).error("Unhandled exception")
    return JSONResponse(status_code=500, content={"detail": "Internal server error"})


@app.get("/")
async def root():
    return {
        "name": "fuze-api",
        "version": __version__,
    }


@app.get("/health/live", status_code=200, include_in_schema=False)
async def liveness():
    return {"status": "ok"}


@app.get("/health/ready", status_code=200, include_in_schema=False)
async def readiness(request: Request):
    checks: dict[str, str] = {}
    try:
        async with request.app.state.session_maker() as session:
            await session.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unavailable"

    try:
        redis = await get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "unavailable"

    checks["storage"] = "ok" if await storage_ready() else "unavailable"

    if any(value != "ok" for value in checks.values()):
        return JSONResponse(
            status_code=503, content={"status": "not_ready", "checks": checks}
        )
    return {"status": "ready", "checks": checks}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
