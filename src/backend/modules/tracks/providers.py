import asyncio
import hashlib
import re
from dataclasses import asdict, dataclass
from typing import Literal, Protocol
from urllib.parse import quote_plus, urlparse, parse_qs

from core.settings import get_settings
from integrations.cache import cache_get, cache_set
from integrations.spotify import SpotifyDisabled, SpotifyError, spotify_client
from integrations.yandex import get_client as get_yandex_client, search_yandex
from integrations.youtube import get_video_info, search_youtube

ProviderStatus = Literal["ok", "unavailable", "rate_limited", "quota_exceeded"]


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
    if re.fullmatch(r"[\w-]{6,20}", value):
        return value
    parsed = urlparse(value)
    if parsed.hostname == "youtu.be":
        return parsed.path.strip("/")
    return parse_qs(parsed.query).get("v", [""])[0]


class YandexProvider:
    source = "yandex"

    async def search(self, query: str) -> list[SearchItem]:
        return [SearchItem(
            source_id=x.track_id, title=x.title, artist=x.artist, album=x.album,
            year=x.year, duration_ms=x.duration_ms, cover_url=x.cover_url,
        ) for x in await search_yandex(query)]

    async def get(self, source_id: str) -> SearchItem:
        client = await get_yandex_client()
        tracks = await client.tracks([source_id])
        if not tracks:
            raise ValueError("Yandex track not found")
        t = tracks[0]
        artist = t.artists[0].name if t.artists else "Unknown"
        album = t.albums[0] if t.albums else None
        return SearchItem(source_id=str(t.id), title=t.title, artist=artist,
            album=album.title if album else None, year=album.year if album else None,
            duration_ms=t.duration_ms,
            cover_url=t.get_cover_url(size="600x600") if t.cover_uri else None)


class YouTubeProvider:
    source = "youtube"

    @staticmethod
    def _item(video) -> SearchItem:
        source_id = youtube_id(video.url)
        return SearchItem(source_id=source_id, title=video.title,
            artist=video.uploader or "Unknown", duration_ms=int(video.duration * 1000),
            cover_url=video.thumbnail,
            external_url=f"https://www.youtube.com/watch?v={source_id}")

    async def search(self, query: str) -> list[SearchItem]:
        return [self._item(x) for x in await search_youtube(query, max_results=10)]

    async def get(self, source_id: str) -> SearchItem:
        source_id = youtube_id(source_id)
        if not source_id:
            raise ValueError("Invalid YouTube video ID")
        video = await get_video_info(f"https://www.youtube.com/watch?v={source_id}")
        return self._item(video)


class SpotifyProvider:
    source = "spotify"

    async def search(self, query: str) -> list[SearchItem]:
        settings = get_settings()
        if not settings.SPOTIFY_ENABLED:
            raise SpotifyDisabled("Spotify API is disabled")
        return [SearchItem(**x) for x in await spotify_client.search(query, settings.SPOTIFY_MARKET)]

    async def get(self, source_id: str) -> SearchItem:
        settings = get_settings()
        if not settings.SPOTIFY_ENABLED:
            raise SpotifyDisabled("Spotify API is disabled")
        if not re.fullmatch(r"[A-Za-z0-9]{22}", source_id):
            raise ValueError("Invalid Spotify track ID")
        item = await spotify_client.get_track(source_id, settings.SPOTIFY_MARKET)
        return SearchItem(**item)


def cache_key(source: str, query: str, market: str) -> str:
    normalized = " ".join(query.casefold().split())
    digest = hashlib.sha256(normalized.encode()).hexdigest()
    return f"track_search:{source}:{market}:{digest}"


async def search_cached(provider: SearchProvider, query: str) -> ProviderResult:
    settings = get_settings()
    market = settings.SPOTIFY_MARKET if provider.source == "spotify" else "-"
    key = cache_key(provider.source, query, market)
    try:
        cached = await cache_get(key)
    except Exception:
        cached = None
    if cached is not None:
        return ProviderResult([SearchItem(**x) for x in cached.get("items", [])], cached=True)
    try:
        items = await asyncio.wait_for(provider.search(query), settings.TRACK_PROVIDER_TIMEOUT_SECONDS)
    except SpotifyError as exc:
        return ProviderResult([], status=exc.status)
    except Exception:
        return ProviderResult([], status="unavailable")
    ttl = settings.TRACK_SEARCH_CACHE_TTL_SECONDS if items else 120
    try:
        await cache_set(key, {"items": [asdict(x) for x in items]}, ttl_seconds=ttl)
    except Exception:
        pass
    return ProviderResult(items)


def spotify_search_url(query: str) -> str:
    return f"https://open.spotify.com/search/{quote_plus(query)}"


PROVIDERS: dict[str, SearchProvider] = {
    "yandex": YandexProvider(), "youtube": YouTubeProvider(), "spotify": SpotifyProvider()
}
