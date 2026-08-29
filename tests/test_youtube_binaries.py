from pathlib import Path
from types import SimpleNamespace

import pytest

from integrations import youtube


@pytest.mark.asyncio
async def test_downloader_uses_preinstalled_binaries(monkeypatch, tmp_path: Path):
    binary_paths = []
    for name in ("yt-dlp", "ffmpeg", "ffprobe", "node"):
        path = tmp_path / name
        path.touch()
        binary_paths.append(path)

    class FakeAsyncYT:
        def __init__(self, bin_dir):
            assert bin_dir == youtube.BACKEND_DIR / "bin"
            (
                self.ytdlp_path,
                self.ffmpeg_path,
                self.ffprobe_path,
                self.node_path,
            ) = binary_paths

    monkeypatch.setattr(youtube, "AsyncYT", FakeAsyncYT)
    monkeypatch.setattr(youtube, "_downloader", None)

    downloader = await youtube.get_downloader()

    assert isinstance(downloader, FakeAsyncYT)


@pytest.mark.asyncio
async def test_downloader_fails_without_preinstalled_binaries(monkeypatch, tmp_path: Path):
    monkeypatch.setattr(
        youtube,
        "AsyncYT",
        lambda bin_dir: SimpleNamespace(
            ytdlp_path=tmp_path / "yt-dlp",
            ffmpeg_path=tmp_path / "ffmpeg",
            ffprobe_path=tmp_path / "ffprobe",
            node_path=tmp_path / "node",
        ),
    )
    monkeypatch.setattr(youtube, "_downloader", None)

    with pytest.raises(RuntimeError, match="yt-dlp, ffmpeg, ffprobe, node"):
        await youtube.get_downloader()
