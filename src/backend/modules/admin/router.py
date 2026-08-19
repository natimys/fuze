import time
from importlib.metadata import PackageNotFoundError, version
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, Query, Request
from sqlalchemy import text

from core.dependencies import require_role
from core.enums import UserRole
from integrations.cache import get_redis
from integrations.storage import storage_ready
from modules.users.models import User

from .dependencies import get_config_service
from .module import module
from .schemas import AuditRead, ProviderTestRead, SettingsRead, SettingsWrite
from .service import ConfigService

router = APIRouter(
    prefix=module.router_prefix,
    tags=module.router_tags,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


@router.get("/settings", response_model=SettingsRead)
async def get_settings(service: ConfigService = Depends(get_config_service)):
    return await service.read()


@router.put("/settings", response_model=SettingsRead)
async def put_settings(
    data: SettingsWrite,
    actor: User = Depends(require_role(UserRole.ADMIN)),
    service: ConfigService = Depends(get_config_service),
):
    return await service.update(data, actor.id)


@router.get("/settings/history", response_model=list[AuditRead])
async def settings_history(
    limit: int = Query(default=50, ge=1, le=200),
    service: ConfigService = Depends(get_config_service),
):
    return await service.history(limit)


@router.post("/providers/{provider}/test", response_model=ProviderTestRead)
async def test_provider(
    provider: str,
    service: ConfigService = Depends(get_config_service),
):
    started = time.monotonic()
    snapshot = await service.get_snapshot(fresh=True)
    if provider not in {"youtube", "yandex", "spotify"}:
        return ProviderTestRead(status="unavailable", latency_ms=0, message="Unsupported provider")
    if not getattr(snapshot.config.providers, provider):
        return ProviderTestRead(status="disabled", latency_ms=0, message="Provider is disabled")
    try:
        if provider == "spotify":
            client_id = snapshot.secrets.get("spotify_client_id")
            client_secret = snapshot.secrets.get("spotify_client_secret")
            if not client_id or not client_secret:
                return ProviderTestRead(status="not_configured", latency_ms=0, message="Credentials are not configured")
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.post(
                    "https://accounts.spotify.com/api/token",
                    data={"grant_type": "client_credentials"},
                    auth=(client_id, client_secret),
                )
                response.raise_for_status()
        elif provider == "yandex":
            token = snapshot.secrets.get("yandex_token")
            if not token:
                return ProviderTestRead(status="not_configured", latency_ms=0, message="Credentials are not configured")
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.get(
                    "https://api.music.yandex.net/account/status",
                    headers={"Authorization": f"OAuth {token}"},
                )
                response.raise_for_status()
        else:
            async with httpx.AsyncClient(timeout=5) as client:
                response = await client.head("https://www.youtube.com/")
                response.raise_for_status()
    except (httpx.HTTPError, ValueError):
        return ProviderTestRead(
            status="unavailable",
            latency_ms=int((time.monotonic() - started) * 1000),
            message="Provider connection failed",
        )
    return ProviderTestRead(
        status="ok",
        latency_ms=int((time.monotonic() - started) * 1000),
        message="Connection successful",
    )


@router.get("/system")
async def system_status(
    request: Request,
    service: ConfigService = Depends(get_config_service),
):
    checks: dict[str, str] = {}
    try:
        await service.db.execute(text("SELECT 1"))
        checks["database"] = "ok"
    except Exception:
        checks["database"] = "unavailable"
    try:
        redis = await get_redis()
        await redis.ping()
        checks["redis"] = "ok"
    except Exception:
        checks["redis"] = "unavailable"
    checks["minio"] = "ok" if await storage_ready() else "unavailable"
    checks["worker"] = "unknown"
    checks["beat"] = "unknown"
    revision = await service.db.scalar(text("SELECT version_num FROM alembic_version LIMIT 1"))
    snapshot = await service.get_snapshot()
    backup_dir = Path("/backups")
    backups = sorted(backup_dir.glob("*.tar*"), key=lambda item: item.stat().st_mtime, reverse=True) if backup_dir.is_dir() else []
    try:
        app_version = version("fuze")
    except PackageNotFoundError:
        app_version = "0.1.0"
    return {
        "app_version": app_version,
        "schema_revision": revision,
        "config_version": snapshot.version,
        "health": checks,
        "last_backup": backups[0].name if backups else None,
        "available_version": None,
        "commands": {
            "doctor": "docker compose exec backend fuze rescue doctor",
            "backup": "docker compose run --rm backup backup",
        },
    }
