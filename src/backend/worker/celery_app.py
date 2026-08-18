from celery import Celery

from core.settings import get_settings

settings = get_settings()
broker_url = settings.EFFECTIVE_CELERY_BROKER_URL

celery_app = Celery("fuze", broker=broker_url)
celery_app.conf.update(
    task_acks_late=True,
    task_reject_on_worker_lost=True,
    worker_prefetch_multiplier=1,
    worker_concurrency=settings.CELERY_WORKER_CONCURRENCY,
    task_soft_time_limit=settings.CELERY_TASK_SOFT_TIME_LIMIT_SECONDS,
    task_time_limit=settings.CELERY_TASK_TIME_LIMIT_SECONDS,
    broker_connection_retry_on_startup=True,
    beat_schedule={
        "recover-stale-track-downloads": {
            "task": "tracks.recover_stale_downloads",
            "schedule": 60.0,
        },
        "reconcile-track-storage": {
            "task": "tracks.reconcile_storage",
            "schedule": 86400.0,
            "kwargs": {"delete_orphans": False, "repair_missing": True},
        },
    },
    timezone="UTC",
)
celery_app.autodiscover_tasks(["worker"])
