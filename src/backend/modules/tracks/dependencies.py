from modules.tracks.service import TracksService


async def get_tracks_service() -> TracksService:
    return TracksService()