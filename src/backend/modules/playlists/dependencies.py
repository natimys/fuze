from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database.dependencies import get_db
from .repository import PlaylistsRepository
from .service import PlaylistsService


async def get_playlists_repository(
    db: AsyncSession = Depends(get_db),
) -> PlaylistsRepository:
    return PlaylistsRepository(db)


async def get_playlist_service(
    playlists_repository: PlaylistsRepository = Depends(get_playlists_repository),
) -> PlaylistsService:
    return PlaylistsService(playlists_repository)
