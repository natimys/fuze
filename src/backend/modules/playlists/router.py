import asyncio

from fastapi import APIRouter, Depends, HTTPException, Response, status

from core.dependencies import current_active_user
from modules.users.models import User
from modules.admin.dependencies import get_config_service
from modules.admin.service import ConfigService

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
    FilePlaylistImport,
    ImportConnect,
    ImportResult,
    ImportSelection,
    ImportSource,
    YandexDeviceAuthPoll,
    YandexDeviceAuthResult,
    YandexDeviceAuthStart,
)
from .service import PlaylistsService

router = APIRouter(prefix=module.router_prefix, tags=module.router_tags)


def _raise_http(exc: PlaylistDomainError) -> None:
    raise HTTPException(status_code=exc.status_code, detail=exc.message) from exc


@router.post("/imports/yandex/auth/start", response_model=YandexDeviceAuthStart)
async def start_yandex_device_auth(
    _: User = Depends(current_active_user),
    config_service: ConfigService = Depends(get_config_service),
):
    """Start Yandex's device flow without exposing OAuth application secrets."""
    from yandex_music import ClientAsync

    if not (await config_service.get_snapshot()).config.providers.yandex:
        raise HTTPException(status_code=403, detail="provider_disabled")
    try:
        async with asyncio.timeout(15):
            code = await ClientAsync().request_device_code(device_name="Fuze")
        return YandexDeviceAuthStart(
            device_code=code.device_code,
            user_code=code.user_code,
            verification_url=code.verification_url,
            expires_in=code.expires_in,
            interval=max(1, int(code.interval)),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail="yandex_device_auth_unavailable") from exc


@router.post("/imports/yandex/auth/poll", response_model=YandexDeviceAuthResult)
async def poll_yandex_device_auth(
    data: YandexDeviceAuthPoll,
    _: User = Depends(current_active_user),
    config_service: ConfigService = Depends(get_config_service),
):
    """Exchange a confirmed device code for the user's OAuth token."""
    from yandex_music import ClientAsync

    if not (await config_service.get_snapshot()).config.providers.yandex:
        raise HTTPException(status_code=403, detail="provider_disabled")
    try:
        async with asyncio.timeout(15):
            token = await ClientAsync().poll_device_token(data.device_code)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="yandex_device_auth_unavailable") from exc
    if token is None:
        return YandexDeviceAuthResult(status="pending")
    return YandexDeviceAuthResult(status="authorized", token=token.access_token)


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


@router.post("/imports/yandex/playlists", response_model=list[ImportSource])
async def yandex_import_sources(data: ImportConnect, service: PlaylistsService = Depends(get_playlist_service)):
    try:
        return await service.yandex_playlists(data.token)
    except Exception as exc:
        raise HTTPException(status_code=502, detail="Yandex Music authorization failed") from exc


@router.post("/imports/yandex", response_model=ImportResult, status_code=status.HTTP_201_CREATED)
async def import_yandex_playlists(data: ImportSelection, user: User = Depends(current_active_user), service: PlaylistsService = Depends(get_playlist_service)):
    try:
        return await service.import_yandex(data.token, data.playlist_ids, user)
    except Exception as exc:
        await service.repository.rollback()
        raise HTTPException(status_code=502, detail="Yandex Music import failed") from exc


@router.post("/imports/file", response_model=ImportResult, status_code=status.HTTP_201_CREATED)
async def import_playlist_file(data: FilePlaylistImport, user: User = Depends(current_active_user), service: PlaylistsService = Depends(get_playlist_service)):
    try:
        return await service.import_file(data, user)
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
