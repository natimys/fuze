from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database.dependencies import get_db
from .repository import TrackRepository
from .service import TracksService


def get_track_repository(db: AsyncSession = Depends(get_db)) -> TrackRepository:
    return TrackRepository(db)


async def get_tracks_service(
    repository: TrackRepository = Depends(get_track_repository),
) -> TracksService:
    return TracksService(repository)
