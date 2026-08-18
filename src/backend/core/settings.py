from functools import lru_cache
from pathlib import Path

from pydantic import SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent.parent.parent.parent
BACKEND_DIR = BASE_DIR / "src" / "backend"


class Settings(BaseSettings):
    DB_HOST: str = "localhost"
    DB_PORT: int = 5432
    DB_USER: str = "postgres"
    DB_PASSWORD: SecretStr = "postgres"
    DB_NAME: str = "postgres"

    YANDEX_ACCESS_TOKEN: SecretStr | None = None
    SPOTIFY_ENABLED: bool = False
    SPOTIFY_CLIENT_ID: str | None = None
    SPOTIFY_CLIENT_SECRET: SecretStr | None = None
    SPOTIFY_MARKET: str = "US"
    TRACK_SEARCH_CACHE_TTL_SECONDS: int = 900
    TRACK_PROVIDER_TIMEOUT_SECONDS: float = 5

    SWAGGER_PATH: str = "/docs"
    REDOC_PATH: str = "/redoc"

    REDIS_URL: str
    JWT_SECURITY_KEY: SecretStr

    CORS_ORIGINS: list[str]
    CORS_ALLOW_CREDENTIALS: bool
    CORS_ALLOW_METHODS: list[str]
    CORS_ALLOW_HEADERS: list[str]

    REFRESH_TOKEN_EXPIRES: int
    ACCESS_TOKEN_EXPIRES: int

    MINIO_ENDPOINT: str = "localhost:9000"
    MINIO_EXTERNAL_ENDPOINT: str = "localhost:9000"
    MINIO_ACCESS_KEY: str = "minioadmin"
    MINIO_SECRET_KEY: str = "minioadmin"
    MINIO_BUCKET: str = "tracks"
    MINIO_SECURE: bool = False

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

    @field_validator("SPOTIFY_MARKET", mode="after")
    @classmethod
    def normalize_spotify_market(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 2 or not value.isalpha():
            raise ValueError("SPOTIFY_MARKET must be a two-letter country code")
        return value

    @model_validator(mode="after")
    def require_spotify_credentials(self):
        if self.SPOTIFY_ENABLED and (
            not self.SPOTIFY_CLIENT_ID or self.SPOTIFY_CLIENT_SECRET is None
        ):
            raise ValueError(
                "SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET are required when SPOTIFY_ENABLED=true"
            )
        return self

    @property
    def DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.DB_USER}:{self.DB_PASSWORD.get_secret_value()}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"

    @property
    def ALEMBIC_DATABASE_URL(self) -> str:
        return f"postgresql+psycopg://{self.DB_USER}:{self.DB_PASSWORD.get_secret_value()}@{self.DB_HOST}:{self.DB_PORT}/{self.DB_NAME}"


class TestSettings(BaseSettings):
    TEST_DB_HOST: str = "localhost"
    TEST_DB_PORT: int = 5432
    TEST_DB_USER: str = "postgres"
    TEST_DB_PASSWORD: SecretStr = "postgres"
    TEST_DB_NAME: str = "postgres"

    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env.test"
    )

    @property
    def TEST_DATABASE_URL(self) -> str:
        return f"postgresql+asyncpg://{self.TEST_DB_USER}:{self.TEST_DB_PASSWORD.get_secret_value()}@{self.TEST_DB_HOST}:{self.TEST_DB_PORT}/{self.TEST_DB_NAME}"


@lru_cache
def get_settings():
    return Settings()
