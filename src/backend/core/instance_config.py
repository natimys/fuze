from functools import lru_cache
from pathlib import Path
import tomllib
from typing import Literal

from pydantic import BaseModel, ConfigDict, field_validator, model_validator


class AuthConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    mode: Literal["password", "key", "both"] = "password"
    registration: bool = True

    @model_validator(mode="after")
    def registration_requires_password_login(self):
        if self.registration and self.mode == "key":
            raise ValueError("registration=true requires auth.mode=password or both")
        return self


class FeaturesConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    playback: bool = True


class ProvidersConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    youtube: bool = True
    yandex: bool = False
    spotify: bool = False
    spotify_market: str = "US"

    @field_validator("spotify_market", mode="after")
    @classmethod
    def normalize_market(cls, value: str) -> str:
        value = value.strip().upper()
        if len(value) != 2 or not value.isalpha():
            raise ValueError("must be a two-letter country code")
        return value


class FuzeConfig(BaseModel):
    model_config = ConfigDict(extra="forbid")

    auth: AuthConfig
    features: FeaturesConfig
    providers: ProvidersConfig


def load_fuze_config(path: Path) -> FuzeConfig:
    try:
        with path.open("rb") as source:
            data = tomllib.load(source)
    except FileNotFoundError:
        raise RuntimeError(f"Fuze configuration file not found: {path}") from None
    except tomllib.TOMLDecodeError as exc:
        raise RuntimeError(f"Invalid TOML in {path}: {exc}") from exc
    return FuzeConfig.model_validate(data)


@lru_cache
def get_fuze_config() -> FuzeConfig:
    from core.settings import BASE_DIR

    return load_fuze_config(BASE_DIR / "config" / "fuze.toml")
