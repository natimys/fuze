from datetime import datetime
from unittest.mock import AsyncMock

import pytest
from pydantic import ValidationError

from core.enums import UserRole
from modules.playlists.errors import InvalidPlaylistOrder, PlaylistNotFound
from modules.playlists.models import Playlist, PlaylistItem
from modules.playlists.schemas import PlaylistCreate, PlaylistReorder, PlaylistUpdate
from modules.playlists.service import PlaylistsService
from modules.users.models import User


def make_user(user_id: int, role: UserRole = UserRole.USER) -> User:
    return User(
        id=user_id,
        email=f"user{user_id}@example.com",
        name=f"User {user_id}",
        password="hash",
        role=role,
        is_active=True,
    )


def make_playlist(owner_id: int = 1) -> Playlist:
    now = datetime.now()
    return Playlist(
        id=10,
        owner_id=owner_id,
        title="Road trip",
        description=None,
        created_at=now,
        updated_at=now,
        items=[],
    )


def test_playlist_input_is_normalized_and_reorder_rejects_duplicates():
    data = PlaylistCreate(title="  Road trip  ", description="  Summer  ")
    assert data.title == "Road trip"
    assert data.description == "Summer"

    with pytest.raises(ValidationError):
        PlaylistReorder(item_ids=[1, 1])
    with pytest.raises(ValidationError):
        PlaylistUpdate()


async def test_regular_user_only_lists_owned_playlists():
    repository = AsyncMock()
    repository.list_with_counts.return_value = []
    service = PlaylistsService(repository)

    await service.list_playlists(make_user(7))

    repository.list_with_counts.assert_awaited_once_with(owner_id=7)


async def test_admin_lists_all_playlists():
    repository = AsyncMock()
    repository.list_with_counts.return_value = []
    service = PlaylistsService(repository)

    await service.list_playlists(make_user(7, UserRole.ADMIN))

    repository.list_with_counts.assert_awaited_once_with(owner_id=None)


async def test_create_assigns_owner_and_commits():
    playlist = make_playlist(owner_id=7)
    repository = AsyncMock()
    repository.create.return_value = playlist
    service = PlaylistsService(repository)

    result = await service.create_playlist(
        PlaylistCreate(title="Road trip"), make_user(7)
    )

    repository.create.assert_awaited_once_with(
        owner_id=7, title="Road trip", description=None
    )
    repository.commit.assert_awaited_once()
    assert result.owner_id == 7
    assert result.tracks_count == 0


async def test_other_user_gets_not_found_for_private_playlist():
    repository = AsyncMock()
    repository.get_by_id.return_value = make_playlist(owner_id=1)
    service = PlaylistsService(repository)

    with pytest.raises(PlaylistNotFound):
        await service.get_playlist(10, make_user(2))


async def test_admin_can_access_another_users_playlist():
    playlist = make_playlist(owner_id=1)
    repository = AsyncMock()
    repository.get_by_id.return_value = playlist
    service = PlaylistsService(repository)

    result = await service.get_playlist(10, make_user(2, UserRole.ADMIN))

    assert result.id == playlist.id


async def test_reorder_requires_complete_item_id_set():
    repository = AsyncMock()
    repository.get_by_id.return_value = make_playlist(owner_id=1)
    repository.item_ids.return_value = [11, 12, 13]
    service = PlaylistsService(repository)

    with pytest.raises(InvalidPlaylistOrder):
        await service.reorder_items(10, [13, 11], make_user(1))

    repository.reorder.assert_not_awaited()


async def test_delete_item_uses_item_id_so_repeated_tracks_are_unambiguous():
    playlist = make_playlist(owner_id=1)
    item = PlaylistItem(id=22, playlist_id=10, track_id=5, position=1)
    repository = AsyncMock()
    repository.get_by_id.return_value = playlist
    repository.get_item.return_value = item
    service = PlaylistsService(repository)

    await service.delete_item(10, 22, make_user(1))

    repository.get_item.assert_awaited_once_with(10, 22)
    repository.delete_item.assert_awaited_once_with(item)
    repository.commit.assert_awaited_once()
