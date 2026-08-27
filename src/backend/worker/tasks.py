import asyncio
from collections.abc import Awaitable, Callable
from typing import TypeVar

from .celery_app import celery_app

from core.settings import get_settings

T = TypeVar("T")
settings = get_settings()
MAX_RETRIES = max(0, settings.CELERY_TASK_MAX_RETRIES - 1)


async def _with_repository(operation: Callable[..., Awaitable[T]], *args) -> T:
    from core.settings import get_settings
    from database.engine import create_engine_and_sessionmaker
    from modules.tracks.repository import TrackRepository

    engine, session_maker = create_engine_and_sessionmaker(get_settings().DATABASE_URL)
    try:
        async with session_maker() as session:
            return await operation(TrackRepository(session), *args)
    finally:
        await engine.dispose()


async def _process(repository, track_id: int, task_id: str) -> bool:
    from integrations.storage import ensure_bucket
    from modules.tracks.service import TrackDownloadProcessor
    from modules.admin.service import ConfigService

    await ensure_bucket()
    return await TrackDownloadProcessor(repository, ConfigService(repository.db)).process(track_id, task_id)


async def _prepare_retry(repository, track_id: int) -> bool:
    return await repository.prepare_retry(
        track_id, max_attempts=settings.CELERY_TASK_MAX_RETRIES
    )


async def _recover(repository) -> list[int]:
    from modules.admin.service import ConfigService

    if not (await ConfigService(repository.db).get_snapshot()).config.features.playback:
        await repository.fail_queued_playback_disabled()
        return []
    return await repository.requeue_stale(max_attempts=settings.CELERY_TASK_MAX_RETRIES)


async def _reconcile(
    repository, delete_orphans: bool, repair_missing: bool
) -> dict[str, int]:
    from integrations.storage import delete_object, ensure_bucket, list_object_keys
    from loguru import logger

    await ensure_bucket()
    database_keys = await repository.storage_keys()
    object_keys = await list_object_keys()
    expected = set(database_keys.values())
    missing_keys = expected - object_keys
    orphan_keys = object_keys - expected
    missing_ids = [
        track_id for track_id, key in database_keys.items() if key in missing_keys
    ]
    if repair_missing:
        await repository.mark_storage_missing(missing_ids)
    if delete_orphans:
        for key in orphan_keys:
            await delete_object(key)
    logger.bind(
        stage="storage_reconciliation",
        missing=len(missing_keys),
        orphans=len(orphan_keys),
        repaired=repair_missing,
        deleted=delete_orphans,
    ).info("Track storage reconciliation completed")
    return {"missing": len(missing_keys), "orphans": len(orphan_keys)}


@celery_app.task(
    bind=True,
    name="tracks.download",
    max_retries=MAX_RETRIES,
    acks_late=True,
    soft_time_limit=settings.CELERY_TASK_SOFT_TIME_LIMIT_SECONDS,
    time_limit=settings.CELERY_TASK_TIME_LIMIT_SECONDS,
)
def download_track(self, track_id: int) -> bool:
    try:
        return asyncio.run(_with_repository(_process, track_id, str(self.request.id)))
    except Exception as exc:
        if self.request.retries < self.max_retries:
            queued = asyncio.run(_with_repository(_prepare_retry, track_id))
            if queued:
                raise self.retry(exc=exc, countdown=2 ** (self.request.retries + 1))
        raise


def enqueue_track_download(track_id: int, task_id: str | None = None) -> str:
    result = download_track.apply_async(args=[track_id], task_id=task_id)
    return str(result.id)


@celery_app.task(name="tracks.recover_stale_downloads")
def recover_stale_downloads() -> int:
    track_ids = asyncio.run(_with_repository(_recover))
    for track_id in track_ids:
        enqueue_track_download(track_id)
    return len(track_ids)


@celery_app.task(name="tracks.reconcile_storage")
def reconcile_track_storage(
    delete_orphans: bool = False, repair_missing: bool = True
) -> dict[str, int]:
    """Repair missing DB references; orphan deletion requires an explicit opt-in."""
    return asyncio.run(_with_repository(_reconcile, delete_orphans, repair_missing))
