from pathlib import Path

from asyncyt import AsyncYT, DownloadConfig, VideoInfo
from asyncyt.encoding import AudioEncodingConfig, EncodingConfig
from asyncyt.enums import AudioCodec, Quality

from core.settings import BACKEND_DIR

_downloader: AsyncYT | None = None


async def get_downloader() -> AsyncYT:
    global _downloader
    if _downloader is None:
        _downloader = AsyncYT(bin_dir=BACKEND_DIR / "bin")
        await _downloader.setup_binaries()
    return _downloader


async def search_youtube(query: str, max_results: int = 5) -> list[VideoInfo]:
    yt = await get_downloader()
    result = await yt.search(query, max_results=max_results)
    return result.results


async def download_audio_to_file(url: str, dest_dir: Path) -> Path:
    yt = await get_downloader()
    encode_config = EncodingConfig(
        audio=AudioEncodingConfig(codec=AudioCodec.OPUS, bitrate="192k")
    )
    config = DownloadConfig(
        output_path=str(dest_dir),
        quality=Quality.AUDIO_ONLY,
        extract_audio=True,
        encoding=encode_config,
    )
    info = await yt.get_video_info(url)
    filename = await yt.download(info.url, config=config)
    return filename


async def get_video_info(url: str) -> VideoInfo:
    yt = await get_downloader()
    return await yt.get_video_info(url)
