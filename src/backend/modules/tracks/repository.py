from datetime import UTC, datetime, timedelta

from sqlalchemy import and_, or_, select, update
from sqlalchemy.dialects.postgresql import insert

from .models import Track, TrackDownloadStatus, TrackSource


class TrackRepository:
    def __init__(self, db):
        self.db = db

    async def find_by_source(self, source: TrackSource, source_id: str) -> Track | None:
        query = select(Track).where(
            Track.source == source, Track.source_id == source_id
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_id(self, track_id: int) -> Track | None:
        query = select(Track).where(Track.id == track_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_sources(
        self, keys: list[tuple[TrackSource, str]]
    ) -> dict[tuple[TrackSource, str], Track]:
        if not keys:
            return {}
        clauses = [
            and_(Track.source == source, Track.source_id == source_id)
            for source, source_id in keys
        ]
        result = await self.db.execute(select(Track).where(or_(*clauses)))
        tracks = result.scalars().all()
        return {(track.source, track.source_id): track for track in tracks}

    async def search_in_db(self, query: str, limit: int = 20) -> list[Track]:
        q = f"%{query}%"
        stmt = (
            select(Track)
            .where(Track.title.ilike(q) | Track.artist.ilike(q))
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **kwargs) -> Track:
        track = Track(**kwargs)
        self.db.add(track)
        await self.db.commit()
        await self.db.refresh(track)
        return track

    async def upsert(self, **kwargs) -> Track:
        stmt = (
            insert(Track)
            .values(**kwargs)
            .on_conflict_do_nothing(index_elements=[Track.source, Track.source_id])
        )
        await self.db.execute(stmt)
        await self.db.commit()
        track = await self.find_by_source(kwargs["source"], kwargs["source_id"])
        if track is None:
            raise RuntimeError("Track upsert failed")
        return track

    async def upsert_and_queue(
        self, max_attempts: int = 3, **kwargs
    ) -> tuple[Track, bool]:
        """Upsert metadata and atomically decide whether a job must be enqueued."""
        stmt = (
            insert(Track)
            .values(**kwargs)
            .on_conflict_do_nothing(index_elements=[Track.source, Track.source_id])
        )
        await self.db.execute(stmt)
        result = await self.db.execute(
            select(Track)
            .where(
                Track.source == kwargs["source"],
                Track.source_id == kwargs["source_id"],
            )
            .with_for_update()
        )
        track = result.scalar_one()
        should_enqueue = track.download_status == TrackDownloadStatus.NOT_REQUESTED or (
            track.download_status == TrackDownloadStatus.FAILED
            and track.download_attempts < max_attempts
        )
        if should_enqueue:
            track.download_status = TrackDownloadStatus.QUEUED
            track.download_requested_at = datetime.now(UTC).replace(tzinfo=None)
            track.download_started_at = None
            track.download_finished_at = None
            track.download_lease_expires_at = None
            track.download_error_code = None
            track.download_error_message = None
        await self.db.commit()
        await self.db.refresh(track)
        return track, should_enqueue

    async def queue_existing(
        self, source: TrackSource, source_id: str, max_attempts: int = 3
    ) -> tuple[Track | None, bool]:
        result = await self.db.execute(
            select(Track)
            .where(Track.source == source, Track.source_id == source_id)
            .with_for_update()
        )
        track = result.scalar_one_or_none()
        if track is None:
            await self.db.rollback()
            return None, False
        should_enqueue = track.download_status == TrackDownloadStatus.NOT_REQUESTED or (
            track.download_status == TrackDownloadStatus.FAILED
            and track.download_attempts < max_attempts
        )
        if should_enqueue:
            track.download_status = TrackDownloadStatus.QUEUED
            track.download_requested_at = datetime.now(UTC).replace(tzinfo=None)
            track.download_started_at = None
            track.download_finished_at = None
            track.download_lease_expires_at = None
            track.download_error_code = None
            track.download_error_message = None
        await self.db.commit()
        await self.db.refresh(track)
        return track, should_enqueue

    async def set_task_id(self, track_id: int, task_id: str) -> None:
        await self.db.execute(
            update(Track)
            .where(
                Track.id == track_id,
                Track.download_status == TrackDownloadStatus.QUEUED,
            )
            .values(download_task_id=task_id)
        )
        await self.db.commit()

    async def mark_enqueue_failed(self, track_id: int, message: str) -> None:
        await self.db.execute(
            update(Track)
            .where(
                Track.id == track_id,
                Track.download_status == TrackDownloadStatus.QUEUED,
            )
            .values(
                download_status=TrackDownloadStatus.FAILED,
                download_error_code="queue_unavailable",
                download_error_message=message[:512],
                download_finished_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
        await self.db.commit()

    async def claim_download(
        self, track_id: int, task_id: str, lease_seconds: int
    ) -> Track | None:
        now = datetime.now(UTC).replace(tzinfo=None)
        result = await self.db.execute(
            update(Track)
            .where(
                Track.id == track_id,
                Track.download_status == TrackDownloadStatus.QUEUED,
                or_(
                    Track.download_task_id == task_id, Track.download_task_id.is_(None)
                ),
            )
            .values(
                download_status=TrackDownloadStatus.DOWNLOADING,
                download_attempts=Track.download_attempts + 1,
                download_started_at=now,
                download_task_id=task_id,
                download_lease_expires_at=now + timedelta(seconds=lease_seconds),
                download_error_code=None,
                download_error_message=None,
            )
            .returning(Track)
        )
        track = result.scalar_one_or_none()
        await self.db.commit()
        return track

    async def mark_ready(
        self, track_id: int, task_id: str, storage_key: str, yt_url: str
    ) -> None:
        await self.db.execute(
            update(Track)
            .where(
                Track.id == track_id,
                Track.download_status == TrackDownloadStatus.DOWNLOADING,
                Track.download_task_id == task_id,
            )
            .values(
                storage_key=storage_key,
                yt_url=yt_url,
                download_status=TrackDownloadStatus.READY,
                download_finished_at=datetime.now(UTC).replace(tzinfo=None),
                download_lease_expires_at=None,
                download_error_code=None,
                download_error_message=None,
            )
        )
        await self.db.commit()

    async def mark_failed(
        self, track_id: int, task_id: str, code: str, message: str
    ) -> None:
        await self.db.execute(
            update(Track)
            .where(
                Track.id == track_id,
                Track.download_status == TrackDownloadStatus.DOWNLOADING,
                Track.download_task_id == task_id,
            )
            .values(
                download_status=TrackDownloadStatus.FAILED,
                download_error_code=code[:64],
                download_error_message=message[:512],
                download_finished_at=datetime.now(UTC).replace(tzinfo=None),
                download_lease_expires_at=None,
            )
        )
        await self.db.commit()

    async def prepare_retry(self, track_id: int, max_attempts: int = 3) -> bool:
        result = await self.db.execute(
            update(Track)
            .where(
                Track.id == track_id,
                Track.download_status == TrackDownloadStatus.FAILED,
                Track.download_attempts < max_attempts,
            )
            .values(
                download_status=TrackDownloadStatus.QUEUED,
                download_requested_at=datetime.now(UTC).replace(tzinfo=None),
                download_finished_at=None,
                download_task_id=None,
            )
            .returning(Track.id)
        )
        queued = result.scalar_one_or_none() is not None
        await self.db.commit()
        return queued

    async def requeue_stale(self, max_attempts: int = 3) -> list[int]:
        now = datetime.now(UTC).replace(tzinfo=None)
        await self.db.execute(
            update(Track)
            .where(
                Track.download_status == TrackDownloadStatus.DOWNLOADING,
                Track.download_lease_expires_at < now,
                Track.download_attempts >= max_attempts,
            )
            .values(
                download_status=TrackDownloadStatus.FAILED,
                download_error_code="max_attempts_exhausted",
                download_error_message="Download attempts exhausted after worker timeout",
                download_finished_at=now,
                download_lease_expires_at=None,
            )
        )
        result = await self.db.execute(
            update(Track)
            .where(
                or_(
                    and_(
                        Track.download_status == TrackDownloadStatus.DOWNLOADING,
                        Track.download_lease_expires_at < now,
                    ),
                    and_(
                        Track.download_status == TrackDownloadStatus.QUEUED,
                        Track.download_requested_at < now - timedelta(minutes=5),
                    ),
                ),
                Track.download_attempts < max_attempts,
            )
            .values(
                download_status=TrackDownloadStatus.QUEUED,
                download_requested_at=now,
                download_lease_expires_at=None,
                download_task_id=None,
                download_error_code=None,
                download_error_message=None,
            )
            .returning(Track.id)
        )
        ids = list(result.scalars().all())
        await self.db.commit()
        return ids

    async def storage_keys(self) -> dict[int, str]:
        result = await self.db.execute(
            select(Track.id, Track.storage_key).where(Track.storage_key.is_not(None))
        )
        return {track_id: key for track_id, key in result.all() if key}

    async def mark_storage_missing(self, track_ids: list[int]) -> None:
        if not track_ids:
            return
        await self.db.execute(
            update(Track)
            .where(Track.id.in_(track_ids))
            .values(
                storage_key=None,
                download_status=TrackDownloadStatus.FAILED,
                download_error_code="storage_object_missing",
                download_error_message="Stored media object is missing",
                download_finished_at=datetime.now(UTC).replace(tzinfo=None),
            )
        )
        await self.db.commit()

    async def update(self, track: Track, **kwargs) -> Track:
        for key, value in kwargs.items():
            if value is not None:
                setattr(track, key, value)
        await self.db.commit()
        await self.db.refresh(track)
        return track
