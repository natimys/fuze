import json
from pathlib import Path

import aiofiles
from asyncyt import AsyncYT, DownloadConfig, VideoInfo
from asyncyt.encoding import AudioEncodingConfig, EncodingConfig
from asyncyt.enums import AudioCodec, Quality

from core.settings import BASE_DIR

binary_dir = BASE_DIR / "src" / "backend" / "bin"
yt = AsyncYT(bin_dir=binary_dir)


async def get_info(url: str) -> VideoInfo:
    return await yt.get_video_info(url)


async def download_audio(url: str) -> Path:
    # TODO: Refactor to download audio to S3
    """
    Download audio from YouTube video
    Args:
        url (str): YouTube video url

    Returns:
        filename (Path): Path of audio file
    """
    encode_config = EncodingConfig(
        audio=AudioEncodingConfig(
            codec=AudioCodec.OPUS,
            bitrate="192k",
        )
    )
    config = DownloadConfig(
        quality=Quality.AUDIO_ONLY,
        extract_audio=True,
        encoding=encode_config,
    )
    info = await yt.get_video_info(url)
    filename = await yt.download(info.url, config=config)
    return filename


async def search_video(query: str, max_results=5) -> list[VideoInfo]:
    """
    Search YouTube videos
    Args:
        max_results: maximum number of results to return
        query (str): search query

    Returns:
        list[VideoInfo]: list of YouTube videos
    """
    result = await yt.search(query, max_results=max_results)
    return result.results


async def main():
    await yt.setup_binaries()
    search_result = await search_video("дайте танк маленький")
    print(search_result)
    async with aiofiles.open("yt_data.json", "w", encoding="utf-8") as file:
        for result in search_result:
            data = {
                "title": result.title,
                "url": result.url,
                "description": result.description,
                "formats": result.formats,
            }
            await file.write(json.dumps(data, ensure_ascii=False, indent=4))
    # await download_audio(search_result[0].url)

# try:
#     asyncio.run(main())
# except KeyboardInterrupt:
#     pass
