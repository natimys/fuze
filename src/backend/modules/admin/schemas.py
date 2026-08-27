from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

from core.instance_config import AuthConfig, FeaturesConfig, FuzeConfig, ProvidersConfig


class CredentialState(BaseModel):
    configured: bool


class SettingsRead(BaseModel):
    version: int
    updated_at: datetime
    updated_by: int | None
    instance_name: str
    auth: AuthConfig
    features: FeaturesConfig
    providers: ProvidersConfig
    credentials: dict[str, CredentialState]


class CredentialWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    yandex_token: str | None = Field(default=None, min_length=1, max_length=4096)
    spotify_client_id: str | None = Field(default=None, min_length=1, max_length=512)
    spotify_client_secret: str | None = Field(default=None, min_length=1, max_length=4096)


class SettingsWrite(BaseModel):
    model_config = ConfigDict(extra="forbid")

    version: int = Field(ge=1)
    instance_name: str = Field(min_length=1, max_length=100)
    auth: AuthConfig
    features: FeaturesConfig
    providers: ProvidersConfig
    credentials: CredentialWrite | None = None

    def app_config(self) -> FuzeConfig:
        return FuzeConfig(
            instance_name=self.instance_name,
            auth=self.auth,
            features=self.features,
            providers=self.providers,
        )


class AuditRead(BaseModel):
    id: int
    actor_id: int | None
    config_version: int
    diff: dict
    created_at: datetime

    model_config = {"from_attributes": True}


class ProviderTestRead(BaseModel):
    status: Literal["ok", "disabled", "unavailable", "not_configured"]
    latency_ms: int
    message: str
