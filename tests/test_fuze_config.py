from pathlib import Path

import pytest
from pydantic import ValidationError

from core.instance_config import load_fuze_config


VALID = """
[auth]
mode = "password"
registration = true
[features]
playback = true
[providers]
youtube = true
yandex = false
spotify = false
spotify_market = "us"
"""


def write(tmp_path: Path, value: str) -> Path:
    path = tmp_path / "fuze.toml"
    path.write_text(value, encoding="utf-8")
    return path


def test_loads_and_normalizes_strict_config(tmp_path):
    config = load_fuze_config(write(tmp_path, VALID))
    assert config.auth.mode == "password"
    assert config.providers.spotify_market == "US"


def test_unknown_setting_reports_its_path(tmp_path):
    with pytest.raises(ValidationError) as error:
        load_fuze_config(write(tmp_path, VALID + "unknown = true\n"))
    assert "providers.unknown" in str(error.value)


def test_key_mode_rejects_registration(tmp_path):
    with pytest.raises(ValidationError, match="registration=true"):
        load_fuze_config(write(tmp_path, VALID.replace('mode = "password"', 'mode = "key"')))


def test_missing_enabled_provider_credentials_are_rejected(tmp_path, monkeypatch):
    config = load_fuze_config(write(tmp_path, VALID.replace("spotify = false", "spotify = true")))
    monkeypatch.setenv("REDIS_URL", "redis://localhost")
    monkeypatch.setenv("JWT_SECURITY_KEY", "test-secret")
    monkeypatch.setenv("CORS_ORIGINS", "[]")
    monkeypatch.setenv("CORS_ALLOW_CREDENTIALS", "false")
    monkeypatch.setenv("CORS_ALLOW_METHODS", "[]")
    monkeypatch.setenv("CORS_ALLOW_HEADERS", "[]")
    monkeypatch.setenv("REFRESH_TOKEN_EXPIRES", "30")
    monkeypatch.setenv("ACCESS_TOKEN_EXPIRES", "15")
    from core.settings import Settings, validate_fuze_credentials

    settings = Settings(
        YANDEX_ACCESS_TOKEN=None,
        SPOTIFY_CLIENT_ID=None,
        SPOTIFY_CLIENT_SECRET=None,
    )
    with pytest.raises(ValueError, match="providers.spotify"):
        validate_fuze_credentials(settings, config)

    yandex_config = load_fuze_config(
        write(tmp_path, VALID.replace("yandex = false", "yandex = true"))
    )
    with pytest.raises(ValueError, match="providers.yandex"):
        validate_fuze_credentials(settings, yandex_config)
