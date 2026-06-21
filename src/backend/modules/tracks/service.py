from pathlib import Path

import aiofiles
from asyncyt import VideoInfo
from fastapi.exceptions import HTTPException

from integrations.youtube import search_video, download_audio, get_info

CHUNK_SIZE = 1024 * 64


class TracksService:
    def __init__(self, db):
        self.db = db

    async def search(self, query: str) -> VideoInfo:
        try:
            video = await search_video(query)
            print(video)
            return video[0]
        except Exception as e:
            print(e)
            raise HTTPException(404)

    async def download(self, url: str) -> Path:
        info = await get_info(url)
        return await download_audio(url)

    async def iter_file(self, path, start, end):
        async with aiofiles.open(path, "rb") as f:
            await f.seek(start)
            remaining = end - start + 1
            while remaining > 0:
                chunk_size = min(CHUNK_SIZE, remaining)
                data = await f.read(chunk_size)
                if not data:
                    break
                remaining -= len(data)
                yield data
