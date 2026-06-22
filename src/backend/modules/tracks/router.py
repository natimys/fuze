from fastapi import APIRouter, Depends, HTTPException, Query

from core.enums import UserRole
from .dependencies import get_tracks_service
from .module import module
from .schemas import (
    TrackDownloadResponse,
    TrackSearchResponse,
    TrackStreamResponse,
)
from .service import TracksService
from ..users.dependencies import require_role

router = APIRouter(
    prefix=module.router_prefix, tags=module.router_tags,
    dependencies=[Depends(require_role(UserRole.USER))]
)


@router.get("/search/", response_model=TrackSearchResponse)
async def search_tracks(
        q: str = Query(..., description="Search query"),
        service: TracksService = Depends(get_tracks_service),
):
    results = await service.search(q)
    return TrackSearchResponse(data=results, query=q)


@router.post("/{track_id}/download/", response_model=TrackDownloadResponse)
async def download_track(
        track_id: int,
        service: TracksService = Depends(get_tracks_service),
):
    try:
        track = await service.save_and_download(track_id)
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    return TrackDownloadResponse(status="ok", track_id=track.id)


@router.get("/{track_id}/stream", response_model=TrackStreamResponse)
async def stream_track(
        track_id: int,
        service: TracksService = Depends(get_tracks_service),
):
    url = await service.get_stream_url(track_id)
    if not url:
        raise HTTPException(status_code=404, detail="Track not found or not downloaded")
    return TrackStreamResponse(url=url)
