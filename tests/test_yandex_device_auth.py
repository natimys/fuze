import sys
from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from modules.playlists.router import poll_yandex_device_auth, start_yandex_device_auth
from modules.playlists.schemas import YandexDeviceAuthPoll


class ConfigServiceStub:
    def __init__(self, enabled=True):
        self.enabled = enabled

    async def get_snapshot(self):
        config = SimpleNamespace(providers=SimpleNamespace(yandex=self.enabled))
        return SimpleNamespace(config=config)


def install_client(monkeypatch, client):
    monkeypatch.setitem(sys.modules, "yandex_music", SimpleNamespace(ClientAsync=lambda: client))


async def test_yandex_device_start_success(monkeypatch):
    class Client:
        async def request_device_code(self, **_):
            return SimpleNamespace(
                device_code="device-code-value",
                user_code="ABCD-EFGH",
                verification_url="https://example.test/device",
                expires_in=600,
                interval=2,
            )

    install_client(monkeypatch, Client())
    result = await start_yandex_device_auth(SimpleNamespace(), ConfigServiceStub())
    assert result.device_code == "device-code-value"
    assert result.interval == 2


async def test_yandex_device_poll_pending_and_success(monkeypatch):
    class Client:
        token = None

        async def poll_device_token(self, _):
            return self.token

    client = Client()
    install_client(monkeypatch, client)
    payload = YandexDeviceAuthPoll(device_code="device-code-value")
    pending = await poll_yandex_device_auth(payload, SimpleNamespace(), ConfigServiceStub())
    assert pending.status == "pending"
    client.token = SimpleNamespace(access_token="user-oauth-token")
    authorized = await poll_yandex_device_auth(payload, SimpleNamespace(), ConfigServiceStub())
    assert authorized.status == "authorized"
    assert authorized.token == "user-oauth-token"


async def test_yandex_device_flow_rejects_disabled_provider(monkeypatch):
    install_client(monkeypatch, SimpleNamespace())
    with pytest.raises(HTTPException) as error:
        await start_yandex_device_auth(SimpleNamespace(), ConfigServiceStub(False))
    assert error.value.status_code == 403
    assert error.value.detail == "provider_disabled"


async def test_yandex_device_flow_maps_upstream_failure(monkeypatch):
    class Client:
        async def request_device_code(self, **_):
            raise RuntimeError("secret upstream response")

    install_client(monkeypatch, Client())
    with pytest.raises(HTTPException) as error:
        await start_yandex_device_auth(SimpleNamespace(), ConfigServiceStub())
    assert error.value.status_code == 502
    assert error.value.detail == "yandex_device_auth_unavailable"
    assert "secret upstream response" not in error.value.detail
