from sqlalchemy.exc import IntegrityError

from core.enums import UserRole
from modules.users.models import User

from .errors import (
    InvalidPlaylistOrder,
    PlaylistConflict,
    PlaylistItemNotFound,
    PlaylistNotFound,
    PlaylistTrackNotFound,
)
from .models import Playlist
from .repository import PlaylistsRepository
from .schemas import (
    FilePlaylistImport,
    PlaylistCreate,
    PlaylistDetail,
    PlaylistItemRead,
    PlaylistSummary,
    PlaylistUpdate,
    ImportResult,
)
from modules.tracks.models import TrackSource
from integrations.yandex import get_user_playlist, list_user_playlists


class PlaylistsService:
    def __init__(self, repository: PlaylistsRepository):
        self.repository = repository

    async def list_playlists(self, user: User) -> list[PlaylistSummary]:
        owner_id = None if user.role == UserRole.ADMIN else user.id
        rows = await self.repository.list_with_counts(owner_id=owner_id)
        return [self._summary(playlist, count) for playlist, count in rows]

    async def create_playlist(
        self, data: PlaylistCreate, user: User
    ) -> PlaylistSummary:
        try:
            playlist = await self.repository.create(
                owner_id=user.id, **data.model_dump()
            )
            await self.repository.commit()
            await self.repository.refresh(playlist)
        except IntegrityError:
            await self.repository.rollback()
            raise PlaylistConflict() from None
        return self._summary(playlist, 0)

    async def yandex_playlists(self, token: str) -> list[dict]:
        return await list_user_playlists(token)

    async def import_yandex(self, token: str, playlist_ids: list[str], user: User) -> ImportResult:
        created = added = 0
        for source_id in dict.fromkeys(playlist_ids):
            title, tracks = await get_user_playlist(token, source_id)
            playlist = await self.repository.create(owner_id=user.id, title=title[:100], description="Imported from Yandex Music")
            values = [{
                "source_id": track.track_id, "title": track.title, "artist": track.artist,
                "album": track.album, "release_year": track.year, "duration_ms": track.duration_ms,
                "cover_url": track.cover_url,
            } for track in tracks]
            added += await self.repository.import_tracks(playlist.id, TrackSource.YANDEX, values)
            created += 1
        await self.repository.commit()
        return ImportResult(playlists_created=created, tracks_added=added)

    async def import_file(self, data: FilePlaylistImport, user: User) -> ImportResult:
        playlist = await self.repository.create(owner_id=user.id, title=data.title, description=f"Imported from {data.source.title()}")
        values = [{**track.model_dump(exclude={"year"}), "release_year": track.year} for track in data.tracks]
        added = await self.repository.import_tracks(playlist.id, TrackSource(data.source), values)
        await self.repository.commit()
        return ImportResult(playlists_created=1, tracks_added=added)

    async def get_playlist(self, playlist_id: int, user: User) -> PlaylistDetail:
        playlist = await self.repository.get_by_id(playlist_id, with_items=True)
        self._ensure_access(playlist, user)
        return self._detail(playlist)

    async def update_playlist(
        self, playlist_id: int, data: PlaylistUpdate, user: User
    ) -> PlaylistDetail:
        playlist = await self.repository.get_by_id(
            playlist_id, with_items=True, for_update=True
        )
        self._ensure_access(playlist, user)
        for name, value in data.model_dump(exclude_unset=True).items():
            setattr(playlist, name, value)
        try:
            await self.repository.flush()
            await self.repository.commit()
        except IntegrityError:
            await self.repository.rollback()
            raise PlaylistConflict() from None
        return await self.get_playlist(playlist_id, user)

    async def delete_playlist(self, playlist_id: int, user: User) -> None:
        playlist = await self.repository.get_by_id(playlist_id, for_update=True)
        self._ensure_access(playlist, user)
        try:
            await self.repository.delete(playlist)
            await self.repository.commit()
        except IntegrityError:
            await self.repository.rollback()
            raise PlaylistConflict() from None

    async def add_item(
        self, playlist_id: int, track_id: int, user: User
    ) -> PlaylistItemRead:
        playlist = await self.repository.get_by_id(playlist_id, for_update=True)
        self._ensure_access(playlist, user)
        if await self.repository.get_track(track_id) is None:
            raise PlaylistTrackNotFound()
        position = await self.repository.next_position(playlist_id)
        try:
            item = await self.repository.add_item(
                playlist_id=playlist_id, track_id=track_id, position=position
            )
            await self.repository.touch(playlist_id)
            await self.repository.commit()
        except IntegrityError:
            await self.repository.rollback()
            raise PlaylistConflict() from None
        detail = await self.get_playlist(playlist_id, user)
        return next(
            response_item
            for response_item in detail.items
            if response_item.id == item.id
        )

    async def delete_item(self, playlist_id: int, item_id: int, user: User) -> None:
        playlist = await self.repository.get_by_id(playlist_id, for_update=True)
        self._ensure_access(playlist, user)
        item = await self.repository.get_item(playlist_id, item_id)
        if item is None:
            raise PlaylistItemNotFound()
        try:
            await self.repository.delete_item(item)
            await self.repository.touch(playlist_id)
            await self.repository.commit()
        except IntegrityError:
            await self.repository.rollback()
            raise PlaylistConflict() from None

    async def reorder_items(
        self, playlist_id: int, item_ids: list[int], user: User
    ) -> PlaylistDetail:
        playlist = await self.repository.get_by_id(playlist_id, for_update=True)
        self._ensure_access(playlist, user)
        current_ids = await self.repository.item_ids(playlist_id)
        if len(item_ids) != len(current_ids) or set(item_ids) != set(current_ids):
            raise InvalidPlaylistOrder()
        try:
            await self.repository.reorder(playlist_id, item_ids)
            await self.repository.touch(playlist_id)
            await self.repository.commit()
        except IntegrityError:
            await self.repository.rollback()
            raise PlaylistConflict() from None
        return await self.get_playlist(playlist_id, user)

    @staticmethod
    def _ensure_access(playlist: Playlist | None, user: User) -> None:
        if playlist is None or (
            playlist.owner_id != user.id and user.role != UserRole.ADMIN
        ):
            raise PlaylistNotFound()

    @staticmethod
    def _summary(playlist: Playlist, tracks_count: int) -> PlaylistSummary:
        return PlaylistSummary(
            id=playlist.id,
            owner_id=playlist.owner_id,
            title=playlist.title,
            description=playlist.description,
            tracks_count=tracks_count,
            created_at=playlist.created_at,
            updated_at=playlist.updated_at,
        )

    @classmethod
    def _detail(cls, playlist: Playlist) -> PlaylistDetail:
        summary = cls._summary(playlist, len(playlist.items))
        return PlaylistDetail(
            **summary.model_dump(),
            items=[PlaylistItemRead.model_validate(item) for item in playlist.items],
        )
