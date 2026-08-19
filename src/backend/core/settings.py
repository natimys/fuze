from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_DIR = BASE_DIR / "src" / "backend"


class Settings(BaseSettings):
    ENVIRONMENT: Literal["development", "test", "production"] = "development"
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: SecretStr = "postgres"
    DB_NAME: str = "postgres"

    YANDEX_ACCESS_TOKEN: SecretStr | None = None
    SPOTIFY_CLIENT_ID: str | None = None
    SPOTIFY_CLIENT_SECRET: SecretStr | None = None
    TRACK_SEARCH_CACHE_TTL_SECONDS: int = 900
    TRACK_PROVIDER_TIMEOUT_SECONDS: float = 5
    API_PREFIX: str = "/api/v1"

    SWAGGER_PATH: str = "/docs"
    REDOC_PATH: str = "/redoc"

    REDIS_URL: str
    REDIS_CONNECT_TIMEOUT_SECONDS: float = 2.0
    REDIS_SOCKET_TIMEOUT_SECONDS: float = 2.0
    JWT_SECURITY_KEY: SecretStr

    CORS_ORIGINS: list[str]
    CORS_ALLOW_CREDENTIALS: bool
    CORS_ALLOW_METHODS: list[str]
    CORS_ALLOW_HEADERS: list[str]

    REFRESH_TOKEN_EXPIRES: int
    ACCESS_TOKEN_EXPIRES: int
    COOKIE_SECURE: bool = False
    COOKIE_SAMESITE: str = "lax"

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_EXTERNAL_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "tracks"
    MINIO_SECURE: bool = False
    MINIO_EXTERNAL_SECURE: bool | None = None
    MINIO_PRESIGNED_TTL_SECONDS: int = 3600

    AUTH_RATE_LIMIT_REQUESTS: int = 20
    AUTH_RATE_LIMIT_WINDOW_SECONDS: int = 60
    SEARCH_RATE_LIMIT_REQUESTS: int = 60
    SEARCH_RATE_LIMIT_WINDOW_SECONDS: int = 60
    ACQUIRE_RATE_LIMIT_REQUESTS: int = 20
    ACQUIRE_RATE_LIMIT_WINDOW_SECONDS: int = 60

    CELERY_BROKER_URL: str | None = None
    CELERY_WORKER_CONCURRENCY: int = 2
    CELERY_TASK_MAX_RETRIES: int = 3
    CELERY_TASK_SOFT_TIME_LIMIT_SECONDS: int = 720
    CELERY_TASK_TIME_LIMIT_SECONDS: int = 900
    TRACK_MAX_DURATION_SECONDS: int = 1800
    TRACK_DOWNLOAD_LEASE_SECONDS: int = 1200

    DEBUG: bool = False

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("JWT_SECURITY_KEY", mode="after")
    @classmethod
    def check_default_key(cls, value: SecretStr) -> SecretStr:
        if value.get_secret_value() == "CHANGE-THIS-PLEASE":
            raise ValueError(
                "JWT_SECURITY_KEY must be changed from default. Change it please"
            )
        return value

    @field_validator("COOKIE_SAMESITE", mode="after")
    @classmethod
    def validate_cookie_samesite(cls, value: str) -> str:
        normalized = value.strip().lower()
        if normalized not in {"lax", "strict", "none"}:
            raise ValueError("COOKIE_SAMESITE must be lax, strict, or none")
        return normalized

    @model_validator(mode="after")
    def enforce_production_security(self):
        if self.ENVIRONMENT != "production":
            return self

        errors: list[str] = []
        if not self.COOKIE_SECURE:
            errors.append("COOKIE_SECURE must be true")
        if self.DEBUG:
            errors.append("DEBUG must be false")
        if len(self.JWT_SECURITY_KEY.get_secret_value()) < 32:
            errors.append("JWT_SECURITY_KEY must contain at least 32 characters")
        if self.DB_PASSWORD.get_secret_value() == "postgres":
            errors.append("DB_PASSWORD must not use the development default")
        if (
            self.MINIO_ACCESS_KEY == "minioadmin"
            or self.MINIO_SECRET_KEY == "minioadmin"
        ):
            errors.append("MinIO credentials must not use the development defaults")
        external = self.MINIO_EXTERNAL_ENDPOINT.casefold()
        if "localhost" in external or "127.0.0.1" in external:
            errors.append("MINIO_EXTERNAL_ENDPOINT must be browser-reachable")
        external_secure = (
            self.MINIO_EXTERNAL_SECURE
            if self.MINIO_EXTERNAL_SECURE is not None
            else self.MINIO_SECURE
        )
        if external.startswith("http://") or not (
            external.startswith("https://") or external_secure
        ):
            errors.append("MINIO_EXTERNAL_ENDPOINT must use HTTPS")
        if self.CORS_ALLOW_CREDENTIALS and "*" in self.CORS_ORIGINS:
            errors.append("credentialed CORS cannot allow every origin")
        if errors:
            raise ValueError("Unsafe production configuration: " + "; ".join(errors))
        return self

    @property
    def EFFECTIVE_CELERY_BROKER_URL(self) -> str:
        return self.CELERY_BROKER_URL or self.REDIS_URL

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD.get_secret_value()}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def ALEMBIC_DATABASE_URL(self) -> str:
        return f"postgresql+psycopg://{self.DB_USER}:{self.DB_PASSWORD.get_secret_value()}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


class TestSettings(BaseSettings):
    TEST_DATABASE_URL: str
    DB_NAME: str | None = None

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env.test",
        env_file_encoding="utf-8",
        case_sensitive=True,
        extra="ignore",
    )

    @field_validator("TEST_DATABASE_URL", mode="after")
    @classmethod
    def require_isolated_database(cls, value: str) -> str:
        database_name = value.rsplit("/", 1)[-1].split("?", 1)[0].lower()
        if "test" not in database_name:
            raise ValueError(
                "TEST_DATABASE_URL must point to a database containing 'test'"
            )
        return value

    @model_validator(mode="after")
    def reject_production_database(self):
        database_name = self.TEST_DATABASE_URL.rsplit("/", 1)[-1].split("?", 1)[0]
        if self.DB_NAME and database_name.casefold() == self.DB_NAME.casefold():
            raise ValueError(
                "TEST_DATABASE_URL must not point to the production database"
            )
        return self

    @property
    def TEST_ALEMBIC_DATABASE_URL(self) -> str:
        return self.TEST_DATABASE_URL.replace(
            "postgresql+asyncpg://", "postgresql+psycopg://", 1
        )


def validate_fuze_credentials(settings: Settings, config) -> None:
    if config.providers.spotify and (
        not settings.SPOTIFY_CLIENT_ID
        or settings.SPOTIFY_CLIENT_SECRET is None
        or not settings.SPOTIFY_CLIENT_SECRET.get_secret_value().strip()
    ):
        raise ValueError(
            "providers.spotify: SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required"
        )
    if config.providers.yandex and (
        settings.YANDEX_ACCESS_TOKEN is None
        or not settings.YANDEX_ACCESS_TOKEN.get_secret_value().strip()
    ):
        raise ValueError("providers.yandex: YANDEX_ACCESS_TOKEN is required")


@lru_cache
def get_settings():
    settings = Settings()
    from core.instance_config import get_fuze_config

    config = get_fuze_config()
    validate_fuze_credentials(settings, config)
    return settings
