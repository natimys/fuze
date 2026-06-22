import tempfile
from pathlib import Path

from integrations.cache import cache_get, cache_set
from integrations.storage import get_presigned_url, upload_file
from integrations.yandex import YandexTrackInfo, search_yandex
from integrations.youtube import download_audio_to_file, search_youtube

from .models import Track, TrackSource
from .repository import TrackRepository


class TracksService:
    def __init__(self, repository: TrackRepository):
        self.repository = repository

    async def search(self, query: str) -> list[dict]:
        yandex_results = await search_yandex(query)

        tracks = []
        for yt_info in yandex_results:
            track = await self.repository.find_by_source(
                TrackSource.YANDEX, yt_info.track_id
            )
            if not track:
                track = await self.repository.create(
                    title=yt_info.title,
                    artist=yt_info.artist,
                    album=yt_info.album,
                    release_year=yt_info.year,
                    duration_ms=yt_info.duration_ms,
                    cover_url=yt_info.cover_url,
                    source=TrackSource.YANDEX,
                    source_id=yt_info.track_id,
                )
            tracks.append({
                "id": track.id,
                "title": track.title,
                "artist": track.artist,
                "album": track.album,
                "year": track.release_year,
                "duration_ms": track.duration_ms,
                "cover_url": track.cover_url,
                "source_id": track.source_id,
                "already_downloaded": track.storage_key is not None,
            })
        return tracks

    async def save_and_download(self, track_id: int) -> Track:
        track = await self.repository.find_by_id(track_id)
        if not track:
            raise ValueError("Track not found")
        if track.storage_key:
            return track

        cache_key = f"yt_search:{track.artist}:{track.title}"
        cached = await cache_get(cache_key)

        if cached and cached.get("url"):
            yt_url = cached["url"]
        else:
            query = f"{track.artist} {track.title}"
            results = await search_youtube(query, max_results=3)
            if not results:
                raise ValueError("No YouTube results found")
            yt_url = results[0].url
            await cache_set(cache_key, {"url": yt_url}, ttl_seconds=86400)

        await self.repository.update(track, yt_url=yt_url)

        with tempfile.TemporaryDirectory() as tmp_dir:
            local_path = await download_audio_to_file(yt_url, Path(tmp_dir))
            object_name = f"{track.source.value}/{track.source_id}.opus"
            await upload_file(local_path, object_name)

        await self.repository.update(track, storage_key=object_name)
        return track

    async def get_stream_url(self, track_id: int) -> str | None:
        track = await self.repository.find_by_id(track_id)
        if not track or not track.storage_key:
            return None
        return await get_presigned_url(track.storage_key)

    async def save_yandex_track(self, yandex_track: YandexTrackInfo) -> Track:
        existing = await self.repository.find_by_source(
            TrackSource.YANDEX, yandex_track.track_id
        )
        if existing:
            return existing
        return await self.repository.create(
            title=yandex_track.title,
            artist=yandex_track.artist,
            album=yandex_track.album,
            release_year=yandex_track.year,
            duration_ms=yandex_track.duration_ms,
            cover_url=yandex_track.cover_url,
            source=TrackSource.YANDEX,
            source_id=yandex_track.track_id,
        )
