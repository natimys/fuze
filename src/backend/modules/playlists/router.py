from fastapi import APIRouter, Depends

from .dependencies import get_playlist_service
from .module import module
from .schemas import PlaylistInfo, PlaylistCreate
from .service import PlaylistsService

router = APIRouter(prefix=module.router_prefix, tags=module.router_tags)


@router.get("/{playlist_id}", response_model=PlaylistInfo)
async def get_playlist(
        playlist_id: int,
        playlists_service: PlaylistsService = Depends(get_playlist_service)
):
    playlist = await playlists_service.get_playlist(playlist_id)
    return PlaylistInfo(**playlist)


@router.post("/", response_model=PlaylistInfo)
async def create_playlist(
        data: PlaylistCreate,
        playlists_service: PlaylistsService = Depends(get_playlist_service)
) -> PlaylistInfo:
    playlist = await playlists_service.create_playlist(data)
    return playlist
