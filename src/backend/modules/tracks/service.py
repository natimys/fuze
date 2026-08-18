import asyncio
import tempfile
from pathlib import Path

from integrations.cache import cache_get, cache_set
from integrations.storage import get_presigned_url, upload_file
from integrations.youtube import download_audio_to_file, search_youtube

from .models import Track, TrackSource
from .providers import PROVIDERS, search_cached, spotify_search_url
from .repository import TrackRepository

_download_locks: dict[tuple[str, str], asyncio.Lock] = {}


class TracksService:
    def __init__(self, repository: TrackRepository):
        self.repository = repository

    async def search(self, query: str) -> dict:
        names = ("yandex", "spotify", "youtube")
        responses = await asyncio.gather(*(search_cached(PROVIDERS[n], query) for n in names))
        provider_results = dict(zip(names, responses, strict=True))
        rows: dict[str, list[dict]] = {n: [] for n in names}
        for name, response in provider_results.items():
            for item in response.items[:10]:
                existing = await self.repository.find_by_source(TrackSource(name), item.source_id)
                rows[name].append({
                    "key": f"{name}:{item.source_id}", "track_id": existing.id if existing else None,
                    "source": name, "action": "playable",
                    **item.__dict__, "already_downloaded": bool(existing and existing.storage_key),
                })
        interleaved = []
        for rank in range(10):
            for name in names:
                if rank < len(rows[name]):
                    interleaved.append(rows[name][rank])
        return {
            "data": interleaved,
            "providers": {n: {"status": r.status, "cached": r.cached} for n, r in provider_results.items()},
            "spotify_search_url": spotify_search_url(query),
        }

    async def acquire(self, source: str, source_id: str) -> Track:
        provider = PROVIDERS.get(source)
        if provider is None:
            raise ValueError("unsupported_source")
        item = await provider.get(source_id)
        canonical_url = item.external_url if source == "youtube" else None
        track = await self.repository.upsert(
            title=item.title, artist=item.artist, album=item.album, release_year=item.year,
            duration_ms=item.duration_ms, cover_url=item.cover_url,
            source=TrackSource(source), source_id=item.source_id, yt_url=canonical_url,
        )
        return await self.save_and_download(track.id)

    async def save_and_download(self, track_id: int) -> Track:
        track = await self.repository.find_by_id(track_id)
        if not track:
            raise ValueError("Track not found")
        if track.storage_key:
            return track
        lock_key = (track.source.value, track.source_id)
        lock = _download_locks.setdefault(lock_key, asyncio.Lock())
        async with lock:
            track = await self.repository.find_by_id(track_id)
            if track is None:
                raise ValueError("Track not found")
            if track.storage_key:
                return track
            return await self._download(track)

    async def _download(self, track: Track) -> Track:
        if track.source == TrackSource.YOUTUBE:
            yt_url = track.yt_url or f"https://www.youtube.com/watch?v={track.source_id}"
        else:
            cache_key = f"yt_search:{track.artist}:{track.title}"
            try:
                cached = await cache_get(cache_key)
            except Exception:
                cached = None
            if cached and cached.get("url"):
                yt_url = cached["url"]
            else:
                results = await search_youtube(f"{track.artist} {track.title}", max_results=3)
                if not results:
                    raise ValueError("No YouTube results found")
                yt_url = results[0].url
                try:
                    await cache_set(cache_key, {"url": yt_url}, ttl_seconds=86400)
                except Exception:
                    pass
        await self.repository.update(track, yt_url=yt_url)
        with tempfile.TemporaryDirectory() as tmp_dir:
            local_path = await download_audio_to_file(yt_url, Path(tmp_dir))
            object_name = f"{track.source.value}/{track.source_id}.opus"
            await upload_file(local_path, object_name)
        return await self.repository.update(track, storage_key=object_name)

    async def get_stream_url(self, track_id: int) -> str | None:
        track = await self.repository.find_by_id(track_id)
        if not track or not track.storage_key:
            return None
        return await get_presigned_url(track.storage_key)
