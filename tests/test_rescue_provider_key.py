import sys
from types import SimpleNamespace

from typer.testing import CliRunner

from cli.main import app


runner = CliRunner()


def install_client(monkeypatch, client):
    monkeypatch.setitem(sys.modules, "yandex_music", SimpleNamespace(ClientAsync=lambda: client))


def test_yandex_provider_key_is_printed_but_not_applied(monkeypatch):
    class Client:
        async def device_auth(self, on_code):
            on_code(SimpleNamespace(verification_url="https://example.test/device", user_code="ABCD-EFGH"))
            return "yandex-provider-key"

    install_client(monkeypatch, Client())

    result = runner.invoke(app, ["rescue", "provider-key", "yandex"])

    assert result.exit_code == 0
    assert "https://example.test/device" in result.output
    assert "ABCD-EFGH" in result.output
    assert "yandex-provider-key" in result.output
    assert "not saved or applied automatically" in result.output


def test_provider_key_rejects_unsupported_provider():
    result = runner.invoke(app, ["rescue", "provider-key", "spotify"])

    assert result.exit_code == 2
    assert "unsupported provider: spotify" in result.output


def test_yandex_provider_key_hides_upstream_error(monkeypatch):
    class Client:
        async def device_auth(self, on_code):
            raise RuntimeError("upstream secret details")

    install_client(monkeypatch, Client())

    result = runner.invoke(app, ["rescue", "provider-key", "yandex"])

    assert result.exit_code == 4
    assert "Yandex authorization failed (RuntimeError)" in result.output
    assert "upstream secret details" not in result.output
