from collections.abc import AsyncGenerator
from contextlib import asynccontextmanager
from importlib.metadata import version

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from loguru import logger

from core.exceptions import AppException
from core.modules import register_modules
from core.security import jwt_security
from core.settings import get_settings
from database.engine import create_engine_and_sessionmaker

__version__ = version("fuze")


@asynccontextmanager
async def lifespan(app: FastAPI) -> AsyncGenerator[None, None]:
    settings = get_settings()
    engine, session_maker = create_engine_and_sessionmaker(
        settings.DATABASE_URL,
        echo=settings.DEBUG,
    )
    app.state.engine = engine
    app.state.session_maker = session_maker

    yield

    await engine.dispose()
    logger.info("Database engine disposed")


settings = get_settings()
app = FastAPI(
    lifespan=lifespan,
    title="fuze",
    docs_url=settings.SWAGGER_PATH,
    redoc_url=settings.REDOC_PATH,
)

jwt_security.handle_errors(app)

register_modules(app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=settings.CORS_ALLOW_CREDENTIALS,
    allow_methods=settings.CORS_ALLOW_METHODS,
    allow_headers=settings.CORS_ALLOW_HEADERS,
)


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


@app.get("/health/", status_code=200)
async def health():
    return {"message": "ok"}


if __name__ == "__main__":
    uvicorn.run("main:app", host="127.0.0.1", port=8000, reload=True)
