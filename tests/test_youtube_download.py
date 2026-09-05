from pathlib import Path
from types import SimpleNamespace

import pytest
from pydantic import SecretStr

from integrations.youtube import download_audio_to_file


class FakeDownloader:
    node_path = Path("/opt/fuze/bin/node")

    def __init__(self, output: Path) -> None:
        self.output = output
        self.url = None
        self.config = None

    async def download(self, url, config):
        self.url = url
        self.config = config
        return self.output


@pytest.mark.asyncio
async def test_download_uses_node_android_client_and_opus_container(
    monkeypatch, tmp_path
):
    output = tmp_path / "track.opus"
    downloader = FakeDownloader(output)

    async def fake_get_downloader():
        return downloader

    monkeypatch.setattr(
        "integrations.youtube.get_downloader", fake_get_downloader
    )
    monkeypatch.setattr(
        "integrations.youtube.get_settings",
        lambda: SimpleNamespace(YTDLP_PROXY=None),
    )

    url = "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
    result = await download_audio_to_file(url, tmp_path)

    assert result == output
    assert downloader.url == url
    assert downloader.config.custom_options == {
        "js_runtimes": f"node:{downloader.node_path}",
        "extractor_args": "youtube:player_client=android",
    }
    assert str(downloader.config.audio_format) == "opus"


@pytest.mark.asyncio
async def test_download_passes_configured_proxy_to_ytdlp(monkeypatch, tmp_path):
    output = tmp_path / "track.opus"
    downloader = FakeDownloader(output)

    async def fake_get_downloader():
        return downloader

    monkeypatch.setattr(
        "integrations.youtube.get_downloader", fake_get_downloader
    )
    monkeypatch.setattr(
        "integrations.youtube.get_settings",
        lambda: SimpleNamespace(
            YTDLP_PROXY=SecretStr("socks5://user:password@proxy:1080")
        ),
    )

    await download_audio_to_file(
        "https://www.youtube.com/watch?v=dQw4w9WgXcQ", tmp_path
    )

    assert downloader.config.proxy == "socks5://user:password@proxy:1080"
