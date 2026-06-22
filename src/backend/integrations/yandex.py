from dataclasses import dataclass

from yandex_music import ClientAsync

from core.settings import get_settings

_client: ClientAsync | None = None


@dataclass
class YandexTrackInfo:
    title: str
    artist: str
    album: str | None
    year: int | None
    duration_ms: int | None
    cover_url: str | None
    track_id: str


async def get_client() -> ClientAsync:
    global _client
    if _client is None:
        settings = get_settings()
        token = settings.YANDEX_ACCESS_TOKEN
        if token is None:
            raise ValueError("YANDEX_ACCESS_TOKEN is not configured")
        _client = ClientAsync(token=token.get_secret_value())
        await _client.init()
    return _client


async def search_yandex(query: str) -> list[YandexTrackInfo]:
    client = await get_client()
    result = await client.search(text=query)
    if not result or not result.tracks:
        return []
    tracks = []
    for t in result.tracks.results[:10]:
        artist = t.artists[0].name if t.artists else "Unknown"
        album = t.albums[0].title if t.albums else None
        year = t.albums[0].year if t.albums else None
        cover_url = t.get_cover_url(size="600x600") if t.cover_uri else None
        tracks.append(YandexTrackInfo(
            title=t.title,
            artist=artist,
            album=album,
            year=year,
            duration_ms=t.duration_ms,
            cover_url=cover_url,
            track_id=str(t.id),
        ))
    return tracks
