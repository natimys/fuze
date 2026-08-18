import asyncio
import re
import tempfile
import unicodedata
import uuid
from dataclasses import dataclass
from difflib import SequenceMatcher
from pathlib import Path

from integrations.cache import cache_get, cache_set
from integrations.storage import get_presigned_url, upload_file
from integrations.youtube import download_audio_to_file, search_youtube
from core.settings import get_settings
from loguru import logger

from .errors import (
    AmbiguousTrackMatch,
    InvalidTrackSource,
    TrackDependencyUnavailable,
    TrackNotFound,
    TrackNotReady,
    TrackStateConflict,
)
from .models import Track, TrackDownloadStatus, TrackSource
from .providers import (
    PROVIDERS,
    SearchItem,
    search_cached,
    spotify_search_url,
    youtube_id,
)
from .repository import TrackRepository


@dataclass(frozen=True)
class AcquireResult:
    track: Track
    newly_queued: bool


def _normalize(value: str) -> str:
    value = unicodedata.normalize("NFKD", value).casefold()
    return " ".join(re.findall(r"[\w]+", value))


def _similarity(left: str, right: str) -> float:
    return SequenceMatcher(None, _normalize(left), _normalize(right)).ratio()


def _validate_item(item: SearchItem) -> None:
    if not item.source_id or len(item.source_id) > 128:
        raise InvalidTrackSource("invalid_source_id")
    if not item.title or len(item.title) > 255:
        raise InvalidTrackSource("invalid_title")
    if not item.artist or len(item.artist) > 255:
        raise InvalidTrackSource("invalid_artist")
    if item.album and len(item.album) > 255:
        raise InvalidTrackSource("invalid_album")
    if item.cover_url and len(item.cover_url) > 512:
        raise InvalidTrackSource("invalid_cover_url")
    max_duration_ms = get_settings().TRACK_MAX_DURATION_SECONDS * 1000
    if item.duration_ms is not None and not (1 <= item.duration_ms <= max_duration_ms):
        raise InvalidTrackSource("invalid_duration")


class TracksService:
    def __init__(self, repository: TrackRepository):
        self.repository = repository

    async def search(self, query: str) -> dict:
        names = ("yandex", "spotify", "youtube")
        responses = await asyncio.gather(
            *(search_cached(PROVIDERS[name], query) for name in names)
        )
        provider_results = dict(zip(names, responses, strict=True))
        items_by_provider = {
            name: response.items[:10] for name, response in provider_results.items()
        }
        existing = await self.repository.find_by_sources(
            [
                (TrackSource(name), item.source_id)
                for name, items in items_by_provider.items()
                for item in items
            ]
        )
        rows: dict[str, list[dict]] = {name: [] for name in names}
        for name, items in items_by_provider.items():
            for item in items:
                track = existing.get((TrackSource(name), item.source_id))
                status = track.download_status.value if track else "remote"
                rows[name].append(
                    {
                        "key": f"{name}:{item.source_id}",
                        "track_id": track.id if track else None,
                        "source": name,
                        "capability": "external" if name == "spotify" else "acquire",
                        "availability": status,
                        **item.__dict__,
                        "already_downloaded": bool(
                            track and track.download_status == TrackDownloadStatus.READY
                        ),
                    }
                )
        interleaved = [
            rows[name][rank]
            for rank in range(10)
            for name in names
            if rank < len(rows[name])
        ]
        return {
            "data": interleaved,
            "providers": {
                name: {"status": result.status, "cached": result.cached}
                for name, result in provider_results.items()
            },
            "spotify_search_url": spotify_search_url(query),
        }

    async def acquire(self, source: str, source_id: str) -> AcquireResult:
        if source == TrackSource.SPOTIFY.value:
            raise InvalidTrackSource("spotify_is_external_only")
        provider = PROVIDERS.get(source)
        if provider is None:
            raise InvalidTrackSource("unsupported_source")
        canonical_id = (
            youtube_id(source_id) if source == TrackSource.YOUTUBE.value else source_id
        )
        if not canonical_id:
            raise InvalidTrackSource("invalid_source_id")
        existing, should_enqueue = await self.repository.queue_existing(
            TrackSource(source),
            canonical_id,
            max_attempts=get_settings().CELERY_TASK_MAX_RETRIES,
        )
        if existing is not None:
            if should_enqueue:
                await self._enqueue(existing)
            elif existing.download_status == TrackDownloadStatus.FAILED:
                raise TrackStateConflict(
                    existing.download_error_code or "max_attempts_exhausted"
                )
            return AcquireResult(track=existing, newly_queued=should_enqueue)
        try:
            item = await provider.get(canonical_id)
        except InvalidTrackSource:
            raise
        except ValueError as exc:
            raise TrackNotFound(str(exc)) from exc
        except Exception as exc:
            raise TrackDependencyUnavailable("provider_unavailable") from exc
        _validate_item(item)
        track, should_enqueue = await self.repository.upsert_and_queue(
            max_attempts=get_settings().CELERY_TASK_MAX_RETRIES,
            title=item.title,
            artist=item.artist,
            album=item.album,
            release_year=item.year,
            duration_ms=item.duration_ms,
            cover_url=item.cover_url,
            source=TrackSource(source),
            source_id=item.source_id,
            yt_url=item.external_url if source == TrackSource.YOUTUBE.value else None,
            download_status=TrackDownloadStatus.NOT_REQUESTED,
        )
        if should_enqueue:
            await self._enqueue(track)
        return AcquireResult(track=track, newly_queued=should_enqueue)

    async def _enqueue(self, track: Track) -> None:
        task_id = str(uuid.uuid4())
        try:
            from worker.tasks import enqueue_track_download

            await self.repository.set_task_id(track.id, task_id)
            enqueue_track_download(track.id, task_id=task_id)
        except Exception as exc:
            await self.repository.mark_enqueue_failed(
                track.id, "Message broker is unavailable"
            )
            logger.bind(track_id=track.id, stage="enqueue").warning(
                "Track enqueue failed: {}", type(exc).__name__
            )
            raise TrackDependencyUnavailable("queue_unavailable") from exc
        await self.repository.set_task_id(track.id, task_id)
        track.download_task_id = task_id

    async def get_track(self, track_id: int) -> Track:
        track = await self.repository.find_by_id(track_id)
        if track is None:
            raise TrackNotFound()
        return track

    async def get_stream_url(self, track_id: int) -> str:
        track = await self.get_track(track_id)
        if track.download_status != TrackDownloadStatus.READY or not track.storage_key:
            raise TrackNotReady(
                track.download_error_code or track.download_status.value
            )
        try:
            return await get_presigned_url(track.storage_key)
        except Exception as exc:
            raise TrackDependencyUnavailable("storage_unavailable") from exc


class TrackDownloadProcessor:
    """Worker-only media pipeline; API requests never call this class."""

    def __init__(self, repository: TrackRepository):
        self.repository = repository

    async def process(self, track_id: int, task_id: str) -> bool:
        track = await self.repository.claim_download(
            track_id,
            task_id,
            lease_seconds=get_settings().TRACK_DOWNLOAD_LEASE_SECONDS,
        )
        if track is None:
            return False
        try:
            log = logger.bind(track_id=track.id, stage="download")
            log.info("Track download started")
            yt_url = await self._resolve_youtube_url(track)
            with tempfile.TemporaryDirectory(prefix="fuze-track-") as tmp_dir:
                local_path = await download_audio_to_file(yt_url, Path(tmp_dir))
                if not local_path.is_file() or local_path.stat().st_size <= 0:
                    raise RuntimeError("encoder produced an empty file")
                object_name = f"{track.source.value}/{track.source_id}.opus"
                await upload_file(local_path, object_name, content_type="audio/ogg")
            await self.repository.mark_ready(track.id, task_id, object_name, yt_url)
            log.bind(stage="ready").info("Track download completed")
            return True
        except AmbiguousTrackMatch as exc:
            await self.repository.mark_failed(track.id, task_id, exc.code, exc.message)
            return False
        except Exception as exc:
            await self.repository.mark_failed(
                track.id,
                task_id,
                "download_failed",
                f"Download failed: {type(exc).__name__}",
            )
            logger.bind(track_id=track.id, stage="failed").warning(
                "Track download failed: {}", type(exc).__name__
            )
            raise

    async def _resolve_youtube_url(self, track: Track) -> str:
        if track.source == TrackSource.YOUTUBE:
            return track.yt_url or f"https://www.youtube.com/watch?v={track.source_id}"
        key = f"yt_match:v2:{_normalize(track.artist)}:{_normalize(track.title)}"
        try:
            cached = await cache_get(key)
        except Exception:
            cached = None
        if cached:
            if cached.get("negative"):
                raise AmbiguousTrackMatch()
            if cached.get("url"):
                return str(cached["url"])
        results = await search_youtube(f"{track.artist} {track.title}", max_results=5)
        scored: list[tuple[float, object]] = []
        for candidate in results:
            duration_ms = int(candidate.duration * 1000)
            duration_limit = max(10_000, int((track.duration_ms or duration_ms) * 0.08))
            duration_ok = (
                track.duration_ms is None
                or abs(duration_ms - track.duration_ms) <= duration_limit
            )
            title_score = _similarity(track.title, candidate.title)
            artist_score = max(
                _similarity(track.artist, candidate.uploader or candidate.title),
                _similarity(track.artist, candidate.title),
            )
            if duration_ok and title_score >= 0.8 and artist_score >= 0.8:
                scored.append(((title_score + artist_score) / 2, candidate))
        scored.sort(key=lambda pair: pair[0], reverse=True)
        if not scored or (len(scored) > 1 and scored[0][0] - scored[1][0] < 0.1):
            try:
                await cache_set(key, {"negative": True}, ttl_seconds=120)
            except Exception:
                pass
            raise AmbiguousTrackMatch()
        url = scored[0][1].url
        try:
            await cache_set(key, {"url": url}, ttl_seconds=86400)
        except Exception:
            pass
        return url
