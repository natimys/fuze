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


async def list_user_playlists(token: str) -> list[dict]:
    client = await get_client(token=token)
    playlists = await client.users_playlists_list()
    liked = await client.users_likes_tracks()
    return [{"id": "liked", "title": "Liked from Yandex Music", "tracks_count": len(liked.tracks or [])}] + [
        {"id": str(item.kind), "title": item.title, "tracks_count": item.track_count or 0} for item in playlists
    ]


def _track_info(track) -> YandexTrackInfo:
    album = track.albums[0] if track.albums else None
    return YandexTrackInfo(
        title=track.title, artist=track.artists[0].name if track.artists else "Unknown",
        album=album.title if album else None, year=album.year if album else None,
        duration_ms=track.duration_ms,
        cover_url=track.get_cover_url(size="600x600") if track.cover_uri else None,
        track_id=str(track.id),
    )


async def get_user_playlist(token: str, playlist_id: str) -> tuple[str, list[YandexTrackInfo]]:
    client = await get_client(token=token)
    if playlist_id == "liked":
        liked = await client.users_likes_tracks()
        liked_tracks = await liked.fetch_tracks_async()
        return "Liked from Yandex Music", [_track_info(track) for track in liked_tracks]
    playlist = await client.users_playlists(kind=int(playlist_id))
    tracks: list[YandexTrackInfo] = []
    for short in playlist.tracks or []:
        track = short.track
        if track is None:
            continue
        tracks.append(_track_info(track))
    return playlist.title, tracks
