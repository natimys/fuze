from datetime import UTC, datetime, timedelta

import pytest
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.tracks.models import Track, TrackDownloadStatus, TrackSource
from modules.tracks.repository import TrackRepository


async def _queued_track(session: AsyncSession, *, attempts: int = 0) -> Track:
    track = Track(
        title="Worker fencing",
        artist="Fuze",
        source=TrackSource.YOUTUBE,
        source_id=f"video{attempts:06d}",
        download_status=TrackDownloadStatus.QUEUED,
        download_attempts=attempts,
        download_requested_at=datetime.now(UTC).replace(tzinfo=None),
    )
    session.add(track)
    await session.commit()
    await session.refresh(track)
    return track


@pytest.mark.asyncio
async def test_stale_worker_cannot_overwrite_new_attempt(test_engine, clean_tables):
    async with AsyncSession(bind=test_engine, expire_on_commit=False) as session:
        repository = TrackRepository(session)
        track = await _queued_track(session)
        first = await repository.claim_download(track.id, "task-a", lease_seconds=1)
        assert first is not None
        first.download_lease_expires_at = datetime.now(UTC).replace(
            tzinfo=None
        ) - timedelta(seconds=1)
        await session.commit()

        assert await repository.requeue_stale(max_attempts=3) == [track.id]
        second = await repository.claim_download(track.id, "task-b", lease_seconds=60)
        assert second is not None
        await repository.mark_ready(track.id, "task-b", "youtube/key.opus", "url")
        await repository.mark_failed(track.id, "task-a", "late_failure", "stale")

        refreshed = await session.scalar(select(Track).where(Track.id == track.id))
        await session.refresh(refreshed)
        assert refreshed.download_status == TrackDownloadStatus.READY
        assert refreshed.storage_key == "youtube/key.opus"


@pytest.mark.asyncio
async def test_expired_final_attempt_becomes_failed(test_engine, clean_tables):
    async with AsyncSession(bind=test_engine, expire_on_commit=False) as session:
        repository = TrackRepository(session)
        track = await _queued_track(session, attempts=2)
        claimed = await repository.claim_download(
            track.id, "task-final", lease_seconds=1
        )
        assert claimed is not None
        claimed.download_lease_expires_at = datetime.now(UTC).replace(
            tzinfo=None
        ) - timedelta(seconds=1)
        await session.commit()

        assert await repository.requeue_stale(max_attempts=3) == []
        await session.refresh(claimed)
        assert claimed.download_status == TrackDownloadStatus.FAILED
        assert claimed.download_error_code == "max_attempts_exhausted"
