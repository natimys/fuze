import asyncio
from pathlib import Path

from asyncyt import AsyncYT, DownloadConfig, VideoInfo
from asyncyt.encoding import AudioEncodingConfig, EncodingConfig
from asyncyt.enums import AudioCodec, AudioFormat, Quality

from core.settings import BACKEND_DIR, get_settings

_downloader: AsyncYT | None = None
_downloader_lock = asyncio.Lock()


async def get_downloader() -> AsyncYT:
    global _downloader
    if _downloader is None:
        async with _downloader_lock:
            if _downloader is None:
                downloader = AsyncYT(bin_dir=BACKEND_DIR / "bin")
                missing = [
                    path.name
                    for path in (
                        downloader.ytdlp_path,
                        downloader.ffmpeg_path,
                        downloader.ffprobe_path,
                        downloader.node_path,
                    )
                    if not path.exists()
                ]
                if missing:
                    raise RuntimeError(
                        "Media binaries must be installed at image build time; "
                        f"missing: {', '.join(missing)}"
                    )
                _downloader = downloader
    return _downloader


async def search_youtube(query: str, max_results: int = 5) -> list[VideoInfo]:
    yt = await get_downloader()
    result = await yt.search(query, max_results=max_results)
    return result.results


async def download_audio_to_file(url: str, dest_dir: Path) -> Path:
    yt = await get_downloader()
    proxy = get_settings().YTDLP_PROXY
    encode_config = EncodingConfig(
        audio=AudioEncodingConfig(codec=AudioCodec.OPUS, bitrate="192k")
    )
    config = DownloadConfig(
        output_path=str(dest_dir),
        quality=Quality.AUDIO_ONLY,
        extract_audio=True,
        audio_format=AudioFormat.OPUS,
        encoding=encode_config,
        proxy=proxy.get_secret_value() if proxy else None,
        custom_options={
            # YouTube now requires its player challenge to be evaluated by a
            # supported JavaScript runtime. AsyncYT discovers Node, but does
            # not pass it to the download command on its own.
            "js_runtimes": f"node:{yt.node_path}",
            # The current yt-dlp default selects android_vr for this workload;
            # its Google Video URL is rejected with HTTP 403. The regular
            # Android client exposes a downloadable fallback format.
            "extractor_args": "youtube:player_client=android",
        },
    )
    filename = await yt.download(url, config=config)
    return filename


async def get_video_info(url: str) -> VideoInfo:
    yt = await get_downloader()
    return await yt.get_video_info(url)
