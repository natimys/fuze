import asyncio
import hashlib
import re
import time
from dataclasses import asdict, dataclass
from typing import Literal, Protocol
from urllib.parse import quote_plus, urlparse, parse_qs

from core.settings import get_settings
from core.instance_config import get_fuze_config
from integrations.cache import (
    cache_acquire_lock,
    cache_get,
    cache_release_lock,
    cache_set,
)
from integrations.spotify import SpotifyDisabled, SpotifyError, spotify_client
from integrations.yandex import get_client as get_yandex_client, search_yandex
from integrations.youtube import get_video_info, search_youtube
from loguru import logger

from .errors import InvalidTrackSource

ProviderStatus = Literal[
    "ok", "disabled", "unavailable", "rate_limited", "quota_exceeded"
]


@dataclass
class SearchItem:
    source_id: str
    title: str
    artist: str
    album: str | None = None
    year: int | None = None
    duration_ms: int | None = None
    cover_url: str | None = None
    external_url: str | None = None


@dataclass
class ProviderResult:
    items: list[SearchItem]
    status: ProviderStatus = "ok"
    cached: bool = False


class SearchProvider(Protocol):
    source: str

    async def search(self, query: str) -> list[SearchItem]: ...
    async def get(self, source_id: str) -> SearchItem: ...


def youtube_id(value: str) -> str:
    if re.fullmatch(r"[\w-]{11}", value):
        return value
    parsed = urlparse(value)
    candidate = (
        parsed.path.strip("/")
        if parsed.hostname == "youtu.be"
        else parse_qs(parsed.query).get("v", [""])[0]
    )
    return candidate if re.fullmatch(r"[\w-]{11}", candidate) else ""


class YandexProvider:
    source = "yandex"

    async def search(self, query: str) -> list[SearchItem]:
        return [
            SearchItem(
                source_id=x.track_id,
                title=x.title,
                artist=x.artist,
                album=x.album,
                year=x.year,
                duration_ms=x.duration_ms,
                cover_url=x.cover_url,
            )
            for x in await search_yandex(query)
        ]

    async def get(self, source_id: str) -> SearchItem:
        if not re.fullmatch(r"[A-Za-z0-9:_-]{1,128}", source_id):
            raise InvalidTrackSource("invalid_yandex_track_id")
        client = await get_yandex_client()
        tracks = await client.tracks([source_id])
        if not tracks:
            raise ValueError("Yandex track not found")
        t = tracks[0]
        artist = t.artists[0].name if t.artists else "Unknown"
        album = t.albums[0] if t.albums else None
        return SearchItem(
            source_id=str(t.id),
            title=t.title,
            artist=artist,
            album=album.title if album else None,
            year=album.year if album else None,
            duration_ms=t.duration_ms,
            cover_url=t.get_cover_url(size="600x600") if t.cover_uri else None,
        )


class YouTubeProvider:
    source = "youtube"

    @staticmethod
    def _item(video) -> SearchItem:
        source_id = youtube_id(video.url)
        return SearchItem(
            source_id=source_id,
            title=video.title,
            artist=video.uploader or "Unknown",
            duration_ms=int(video.duration * 1000),
            cover_url=video.thumbnail,
            external_url=f"https://www.youtube.com/watch?v={source_id}",
        )

    async def search(self, query: str) -> list[SearchItem]:
        return [self._item(x) for x in await search_youtube(query, max_results=10)]

    async def get(self, source_id: str) -> SearchItem:
        source_id = youtube_id(source_id)
        if not source_id:
            raise InvalidTrackSource("invalid_youtube_video_id")
        video = await get_video_info(f"https://www.youtube.com/watch?v={source_id}")
        return self._item(video)


class SpotifyProvider:
    source = "spotify"

    async def search(self, query: str) -> list[SearchItem]:
        config = get_fuze_config()
        if not config.providers.spotify:
            raise SpotifyDisabled("Spotify API is disabled")
        return [
            SearchItem(**x)
            for x in await spotify_client.search(query, config.providers.spotify_market)
        ]

    async def get(self, source_id: str) -> SearchItem:
        config = get_fuze_config()
        if not config.providers.spotify:
            raise SpotifyDisabled("Spotify API is disabled")
        if not re.fullmatch(r"[A-Za-z0-9]{22}", source_id):
            raise ValueError("Invalid Spotify track ID")
        item = await spotify_client.get_track(source_id, config.providers.spotify_market)
        return SearchItem(**item)


def cache_key(source: str, query: str, market: str) -> str:
    normalized = " ".join(query.casefold().split())
    digest = hashlib.sha256(normalized.encode()).hexdigest()
    return f"track_search:v2:{source}:{market}:{digest}"


async def search_cached(provider: SearchProvider, query: str) -> ProviderResult:
    settings = get_settings()
    providers = get_fuze_config().providers
    market = providers.spotify_market if provider.source == "spotify" else "-"
    key = cache_key(provider.source, query, market)
    try:
        cached = await cache_get(key)
    except Exception:
        cached = None
    if cached is not None:
        logger.bind(provider=provider.source, cache="hit").debug(
            "Track provider cache hit"
        )
        return ProviderResult(
            [SearchItem(**x) for x in cached.get("items", [])], cached=True
        )
    token: str | None = None
    try:
        token = await cache_acquire_lock(
            key, ttl_seconds=max(2, int(settings.TRACK_PROVIDER_TIMEOUT_SECONDS) + 2)
        )
    except Exception:
        pass
    if token is None:
        deadline = time.monotonic() + settings.TRACK_PROVIDER_TIMEOUT_SECONDS
        while time.monotonic() < deadline:
            await asyncio.sleep(0.05)
            try:
                cached = await cache_get(key)
            except Exception:
                break
            if cached is not None:
                logger.bind(provider=provider.source, cache="coalesced").debug(
                    "Track provider request coalesced"
                )
                return ProviderResult(
                    [SearchItem(**x) for x in cached.get("items", [])], cached=True
                )
    started = time.monotonic()
    try:
        items = await asyncio.wait_for(
            provider.search(query), settings.TRACK_PROVIDER_TIMEOUT_SECONDS
        )
        ttl = settings.TRACK_SEARCH_CACHE_TTL_SECONDS if items else 120
        try:
            await cache_set(key, {"items": [asdict(x) for x in items]}, ttl_seconds=ttl)
        except Exception:
            pass
        return ProviderResult(items)
    except SpotifyDisabled:
        return ProviderResult([], status="disabled")
    except SpotifyError as exc:
        return ProviderResult([], status=exc.status)
    except Exception:
        return ProviderResult([], status="unavailable")
    finally:
        elapsed_ms = round((time.monotonic() - started) * 1000, 1)
        logger.bind(provider=provider.source, latency_ms=elapsed_ms).info(
            "Track provider search completed"
        )
        if token is not None:
            try:
                await cache_release_lock(key, token)
            except Exception:
                pass


def spotify_search_url(query: str) -> str:
    return f"https://open.spotify.com/search/{quote_plus(query)}"


PROVIDERS: dict[str, SearchProvider] = {
    "yandex": YandexProvider(),
    "youtube": YouTubeProvider(),
    "spotify": SpotifyProvider(),
}
