from fastapi import APIRouter, Depends, HTTPException, Response, status

from core.dependencies import current_active_user
from modules.users.models import User

from .dependencies import get_playlist_service
from .errors import PlaylistDomainError
from .module import module
from .schemas import (
    PlaylistCreate,
    PlaylistDetail,
    PlaylistItemCreate,
    PlaylistItemRead,
    PlaylistReorder,
    PlaylistSummary,
    PlaylistUpdate,
)
from .service import PlaylistsService

router = APIRouter(prefix=module.router_prefix, tags=module.router_tags)


def _raise_http(exc: PlaylistDomainError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.get("", response_model=list[PlaylistSummary])
async def list_playlists(
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    return await service.list_playlists(user)


@router.post("", response_model=PlaylistSummary, status_code=status.HTTP_201_CREATED)
async def create_playlist(
    data: PlaylistCreate,
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    try:
        return await service.create_playlist(data, user)
    except PlaylistDomainError as exc:
        _raise_http(exc)


@router.get("/{playlist_id}", response_model=PlaylistDetail)
async def get_playlist(
    playlist_id: int,
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    try:
        return await service.get_playlist(playlist_id, user)
    except PlaylistDomainError as exc:
        _raise_http(exc)


@router.patch("/{playlist_id}", response_model=PlaylistDetail)
async def update_playlist(
    playlist_id: int,
    data: PlaylistUpdate,
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    try:
        return await service.update_playlist(playlist_id, data, user)
    except PlaylistDomainError as exc:
        _raise_http(exc)


@router.delete("/{playlist_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist(
    playlist_id: int,
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    try:
        await service.delete_playlist(playlist_id, user)
    except PlaylistDomainError as exc:
        _raise_http(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.post(
    "/{playlist_id}/items",
    response_model=PlaylistItemRead,
    status_code=status.HTTP_201_CREATED,
)
async def add_playlist_item(
    playlist_id: int,
    data: PlaylistItemCreate,
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    try:
        return await service.add_item(playlist_id, data.track_id, user)
    except PlaylistDomainError as exc:
        _raise_http(exc)


@router.delete("/{playlist_id}/items/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_playlist_item(
    playlist_id: int,
    item_id: int,
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    try:
        await service.delete_item(playlist_id, item_id, user)
    except PlaylistDomainError as exc:
        _raise_http(exc)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.put("/{playlist_id}/items/reorder", response_model=PlaylistDetail)
async def reorder_playlist_items(
    playlist_id: int,
    data: PlaylistReorder,
    user: User = Depends(current_active_user),
    service: PlaylistsService = Depends(get_playlist_service),
):
    try:
        return await service.reorder_items(playlist_id, data.item_ids, user)
    except PlaylistDomainError as exc:
        _raise_http(exc)
