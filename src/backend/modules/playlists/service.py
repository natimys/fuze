from .repository import PlaylistsRepository
from .schemas import PlaylistCreate


class PlaylistsService:
    def __init__(self, repository: PlaylistsRepository):
        self.repository = repository

    async def create_playlist(self, data: PlaylistCreate):
        playlist = await self.repository.create(**data.model_dump())
        return playlist

    async def get_playlist(self, playlist_id: int):
        playlist = await self.repository.get_by_id(playlist_id)
        tracks_count = await self.repository.get_tracks_count(playlist_id)
        return {"tracks_count": tracks_count, **playlist}
