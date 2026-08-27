from typing import Any

from sqlalchemy import case, func, select, update
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload
from sqlalchemy.dialects.postgresql import insert

from modules.tracks.models import Track, TrackDownloadStatus, TrackSource

from .models import Playlist, PlaylistItem


class PlaylistsRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def list_with_counts(
        self, *, owner_id: int | None
    ) -> list[tuple[Playlist, int]]:
        statement = (
            select(Playlist, func.count(PlaylistItem.id).label("tracks_count"))
            .outerjoin(PlaylistItem)
            .group_by(Playlist.id)
            .order_by(Playlist.id)
        )
        if owner_id is not None:
            statement = statement.where(Playlist.owner_id == owner_id)
        result = await self.db.execute(statement)
        return [(playlist, count) for playlist, count in result.all()]

    async def get_by_id(
        self, playlist_id: int, *, with_items: bool = False, for_update: bool = False
    ) -> Playlist | None:
        statement = select(Playlist).where(Playlist.id == playlist_id)
        if with_items:
            statement = statement.options(
                selectinload(Playlist.items).selectinload(PlaylistItem.track)
            )
        if for_update:
            statement = statement.with_for_update()
        result = await self.db.execute(statement)
        return result.scalar_one_or_none()

    async def create(self, **values: Any) -> Playlist:
        playlist = Playlist(**values)
        self.db.add(playlist)
        await self.db.flush()
        return playlist

    async def get_track(self, track_id: int) -> Track | None:
        result = await self.db.execute(select(Track).where(Track.id == track_id))
        return result.scalar_one_or_none()

    async def next_position(self, playlist_id: int) -> int:
        result = await self.db.execute(
            select(func.coalesce(func.max(PlaylistItem.position), -1) + 1).where(
                PlaylistItem.playlist_id == playlist_id
            )
        )
        return result.scalar_one()

    async def add_item(
        self, *, playlist_id: int, track_id: int, position: int
    ) -> PlaylistItem:
        item = PlaylistItem(
            playlist_id=playlist_id, track_id=track_id, position=position
        )
        self.db.add(item)
        await self.db.flush()
        return item

    async def import_tracks(self, playlist_id: int, source: TrackSource, tracks: list[dict]) -> int:
        """Idempotently store metadata without queueing media downloads."""
        seen: set[str] = set()
        position = await self.next_position(playlist_id)
        added = 0
        for values in tracks:
            source_id = values["source_id"]
            if source_id in seen:
                continue
            seen.add(source_id)
            await self.db.execute(
                insert(Track).values(source=source, download_status=TrackDownloadStatus.NOT_REQUESTED, **values)
                .on_conflict_do_nothing(index_elements=[Track.source, Track.source_id])
            )
            result = await self.db.execute(select(Track.id).where(Track.source == source, Track.source_id == source_id))
            track_id = result.scalar_one()
            exists = await self.db.execute(select(PlaylistItem.id).where(PlaylistItem.playlist_id == playlist_id, PlaylistItem.track_id == track_id))
            if exists.scalar_one_or_none() is not None:
                continue
            self.db.add(PlaylistItem(playlist_id=playlist_id, track_id=track_id, position=position))
            position += 1
            added += 1
        await self.db.flush()
        return added

    async def get_item(self, playlist_id: int, item_id: int) -> PlaylistItem | None:
        result = await self.db.execute(
            select(PlaylistItem).where(
                PlaylistItem.playlist_id == playlist_id,
                PlaylistItem.id == item_id,
            )
        )
        return result.scalar_one_or_none()

    async def delete_item(self, item: PlaylistItem) -> None:
        playlist_id = item.playlist_id
        await self.db.delete(item)
        await self.db.flush()
        remaining_ids = await self.item_ids(playlist_id)
        await self.reorder(playlist_id, remaining_ids)

    async def reorder(self, playlist_id: int, item_ids: list[int]) -> None:
        if not item_ids:
            return
        positions = {item_id: position for position, item_id in enumerate(item_ids)}
        # Move every row into a disjoint range first. This makes swaps safe with a
        # non-deferrable unique constraint on (playlist_id, position).
        await self.db.execute(
            update(PlaylistItem)
            .where(
                PlaylistItem.playlist_id == playlist_id,
                PlaylistItem.id.in_(item_ids),
            )
            .values(position=-PlaylistItem.position - 1)
        )
        await self.db.execute(
            update(PlaylistItem)
            .where(
                PlaylistItem.playlist_id == playlist_id,
                PlaylistItem.id.in_(item_ids),
            )
            .values(position=case(positions, value=PlaylistItem.id))
        )

    async def delete(self, playlist: Playlist) -> None:
        await self.db.delete(playlist)
        await self.db.flush()

    async def flush(self) -> None:
        await self.db.flush()

    async def touch(self, playlist_id: int) -> None:
        await self.db.execute(
            update(Playlist)
            .where(Playlist.id == playlist_id)
            .values(updated_at=func.now())
        )

    async def item_ids(self, playlist_id: int) -> list[int]:
        result = await self.db.execute(
            select(PlaylistItem.id)
            .where(PlaylistItem.playlist_id == playlist_id)
            .order_by(PlaylistItem.position)
        )
        return list(result.scalars().all())

    async def commit(self) -> None:
        await self.db.commit()

    async def rollback(self) -> None:
        await self.db.rollback()

    async def refresh(
        self, instance: Any, *, attribute_names: list[str] | None = None
    ) -> None:
        await self.db.refresh(instance, attribute_names=attribute_names)
