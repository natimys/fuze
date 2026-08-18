from fastapi import APIRouter, Depends, HTTPException, Query, Response, status

from core.enums import UserRole
from core.rate_limit import acquire_rate_limit, search_rate_limit
from .dependencies import get_tracks_service
from .module import module
from .schemas import (
    TrackAcquireRequest,
    TrackAcquireResponse,
    TrackRead,
    TrackSearchResponse,
    TrackStreamResponse,
)
from .service import TracksService
from .errors import TrackDomainError
from core.dependencies import require_role

router = APIRouter(
    prefix=module.router_prefix,
    tags=module.router_tags,
    dependencies=[Depends(require_role(UserRole.USER))],
)


@router.get("/search", response_model=TrackSearchResponse)
async def search_tracks(
    q: str = Query(..., min_length=2, max_length=200, description="Search query"),
    _rate_limit: None = Depends(search_rate_limit),
    service: TracksService = Depends(get_tracks_service),
):
    results = await service.search(q)
    return TrackSearchResponse(query=q, **results)


@router.post(
    "/acquire",
    response_model=TrackAcquireResponse,
    status_code=status.HTTP_202_ACCEPTED,
    responses={status.HTTP_200_OK: {"model": TrackAcquireResponse}},
)
async def acquire_track(
    body: TrackAcquireRequest,
    response: Response,
    _rate_limit: None = Depends(acquire_rate_limit),
    service: TracksService = Depends(get_tracks_service),
):
    try:
        result = await service.acquire(body.source, body.source_id)
    except TrackDomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    response.status_code = (
        status.HTTP_202_ACCEPTED
        if result.track.download_status.value != "ready"
        else status.HTTP_200_OK
    )
    return TrackAcquireResponse(
        status=result.track.download_status, track_id=result.track.id
    )


@router.get("/{track_id}", response_model=TrackRead)
async def get_track(
    track_id: int, service: TracksService = Depends(get_tracks_service)
):
    try:
        return await service.get_track(track_id)
    except TrackDomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("/{track_id}/stream", response_model=TrackStreamResponse)
async def stream_track(
    track_id: int,
    service: TracksService = Depends(get_tracks_service),
):
    try:
        url = await service.get_stream_url(track_id)
    except TrackDomainError as exc:
        raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc
    return TrackStreamResponse(url=url)
