import asyncio
from dataclasses import dataclass

from yandex_music import ClientAsync

from core.settings import get_settings

_client: ClientAsync | None = None
_client_token_hash: str | None = None
_client_lock = asyncio.Lock()


@dataclass
class YandexTrackInfo:
    title: str
    artist: str
    album: str | None
    year: int | None
    duration_ms: int | None
    cover_url: str | None
    track_id: str


async def get_client(token: str | None = None) -> ClientAsync:
    global _client, _client_token_hash
    if token is None:
        legacy = get_settings().YANDEX_ACCESS_TOKEN
        token = legacy.get_secret_value() if legacy is not None else None
    if not token:
        raise ValueError("Yandex credential is not configured")
    token_hash = __import__("hashlib").sha256(token.encode()).hexdigest()
    if _client is None or _client_token_hash != token_hash:
        async with _client_lock:
            if _client is None or _client_token_hash != token_hash:
                client = ClientAsync(token=token)
                await client.init()
                _client = client
                _client_token_hash = token_hash
    return _client


async def search_yandex(query: str, token: str | None = None) -> list[YandexTrackInfo]:
    client = await get_client(token=token)
    result = await client.search(text=query)
    if not result or not result.tracks:
        return []
    tracks = []
    for t in result.tracks.results[:10]:
        artist = t.artists[0].name if t.artists else "Unknown"
        album = t.albums[0].title if t.albums else None
        year = t.albums[0].year if t.albums else None
        cover_url = t.get_cover_url(size="600x600") if t.cover_uri else None
        tracks.append(
            YandexTrackInfo(
                title=t.title,
                artist=artist,
                album=album,
                year=year,
                duration_ms=t.duration_ms,
                cover_url=cover_url,
                track_id=str(t.id),
            )
        )
    return tracks
