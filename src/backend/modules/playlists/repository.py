from sqlalchemy import select, func, delete
from sqlalchemy.ext.asyncio import AsyncSession

from .models import Playlist, PlaylistTrack


class PlaylistsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_tracks_count(self, playlist_id: int) -> int:
        query = select(func.count(PlaylistTrack.track_id)).where(
            PlaylistTrack.playlist_id == playlist_id
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_by_id(self, id: int) -> Playlist | None:
        query = select(Playlist).where(Playlist.id == id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def create(self, **kwargs) -> Playlist:
        playlist = Playlist(**kwargs)
        self.db.add(playlist)
        await self.db.commit()
        await self.db.refresh(playlist)
        return playlist

    async def get_next_position(self, playlist_id: int) -> int | None:
        query = select(func.coalesce(func.max(PlaylistTrack.position) - 1), 1).where(
            PlaylistTrack.playlist_id == playlist_id
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def add_track(self, playlist_id: int, track_id: int) -> PlaylistTrack:
        position = await self.get_next_position(playlist_id)
        playlist_track = PlaylistTrack(
            playlist_id=playlist_id,
            track_id=track_id,
            position=position,
        )
        self.db.add(playlist_track)
        await self.db.commit()
        return playlist_track

    async def remove_track(self, playlist_id: int, track_id: int) -> None:
        query = delete(PlaylistTrack).where(
            PlaylistTrack.playlist_id == playlist_id,
            PlaylistTrack.track_id == track_id,
        )
        await self.db.execute(query)
        await self.db.commit()
