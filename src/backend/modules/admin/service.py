import base64
import asyncio
import hashlib
import time
from dataclasses import dataclass
from typing import Any

from cryptography.fernet import Fernet, InvalidToken
from fastapi import HTTPException, status
from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from core.instance_config import FuzeConfig
from core.settings import get_settings
from modules.users.models import User
from core.enums import UserRole

from .models import InstanceSecret, InstanceSettings, InstanceSettingsAudit
from .schemas import AuditRead, CredentialState, SettingsRead, SettingsWrite

SECRET_NAMES = ("yandex_token", "spotify_client_id", "spotify_client_secret")
_CACHE_TTL_SECONDS = 5.0


@dataclass(frozen=True)
class ConfigSnapshot:
    version: int
    config: FuzeConfig
    secrets: dict[str, str]


_cached_snapshot: ConfigSnapshot | None = None
_cached_at = 0.0
_cache_lock = asyncio.Lock()


def invalidate_config_cache() -> None:
    global _cached_snapshot, _cached_at
    _cached_snapshot = None
    _cached_at = 0.0


class ConfigCipher:
    def __init__(self, key: str | None = None):
        material = (key or get_settings().EFFECTIVE_CONFIG_ENCRYPTION_KEY).encode("utf-8")
        derived = base64.urlsafe_b64encode(hashlib.sha256(material).digest())
        self._fernet = Fernet(derived)

    def encrypt(self, plaintext: str) -> str:
        return self._fernet.encrypt(plaintext.encode("utf-8")).decode("ascii")

    def decrypt(self, ciphertext: str) -> str:
        try:
            return self._fernet.decrypt(ciphertext.encode("ascii")).decode("utf-8")
        except (InvalidToken, UnicodeError, ValueError) as exc:
            raise ValueError("Stored provider credential cannot be decrypted") from exc


class ConfigService:
    def __init__(self, db: AsyncSession, cipher: ConfigCipher | None = None):
        self.db = db
        self.cipher = cipher or ConfigCipher()

    async def get_snapshot(self, *, fresh: bool = False) -> ConfigSnapshot:
        global _cached_snapshot, _cached_at
        now = time.monotonic()
        if not fresh and _cached_snapshot is not None and now - _cached_at < _CACHE_TTL_SECONDS:
            return _cached_snapshot

        async with _cache_lock:
            now = time.monotonic()
            if not fresh and _cached_snapshot is not None and now - _cached_at < _CACHE_TTL_SECONDS:
                return _cached_snapshot
            row = await self.db.scalar(
                select(InstanceSettings)
                .where(InstanceSettings.id == 1)
                .execution_options(populate_existing=True)
            )
            if row is None:
                raise RuntimeError("Instance settings are not initialized; run migrations")
            config = FuzeConfig.model_validate(row.settings)
            result = await self.db.execute(select(InstanceSecret))
            secrets = {
                item.name: self.cipher.decrypt(item.ciphertext)
                for item in result.scalars().all()
            }
            snapshot = ConfigSnapshot(version=row.version, config=config, secrets=secrets)
            _cached_snapshot = snapshot
            _cached_at = now
            return snapshot

    async def read(self) -> SettingsRead:
        row = await self.db.scalar(
            select(InstanceSettings)
            .where(InstanceSettings.id == 1)
            .execution_options(populate_existing=True)
        )
        if row is None:
            raise RuntimeError("Instance settings are not initialized; run migrations")
        config = FuzeConfig.model_validate(row.settings)
        result = await self.db.execute(select(InstanceSecret.name))
        configured = set(result.scalars().all())
        return SettingsRead(
            version=row.version,
            updated_at=row.updated_at,
            updated_by=row.updated_by,
            **config.model_dump(),
            credentials={name: CredentialState(configured=name in configured) for name in SECRET_NAMES},
        )

    async def update(self, payload: SettingsWrite, actor_id: int) -> SettingsRead:
        row = await self.db.get(InstanceSettings, 1)
        if row is None:
            raise RuntimeError("Instance settings are not initialized; run migrations")
        if row.version != payload.version:
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="settings_version_conflict")

        new_config = payload.app_config()
        existing_result = await self.db.execute(select(InstanceSecret))
        existing = {item.name: item for item in existing_result.scalars().all()}
        secret_events: dict[str, str] = {}
        if payload.credentials is not None:
            for name in SECRET_NAMES:
                if name not in payload.credentials.model_fields_set:
                    continue
                value = getattr(payload.credentials, name)
                if value is None:
                    if name in existing:
                        await self.db.delete(existing[name])
                        existing.pop(name)
                        secret_events[name] = "credential_removed"
                else:
                    encrypted = self.cipher.encrypt(value.strip())
                    if name in existing:
                        existing[name].ciphertext = encrypted
                        secret_events[name] = "credential_replaced"
                    else:
                        item = InstanceSecret(name=name, ciphertext=encrypted)
                        self.db.add(item)
                        existing[name] = item
                        secret_events[name] = "credential_added"

        if new_config.providers.yandex and "yandex_token" not in existing:
            raise HTTPException(status_code=422, detail="yandex_credentials_required")
        if new_config.providers.spotify and not {
            "spotify_client_id", "spotify_client_secret"
        }.issubset(existing):
            raise HTTPException(status_code=422, detail="spotify_credentials_required")

        old_config = FuzeConfig.model_validate(row.settings)
        diff = self._safe_diff(old_config.model_dump(), new_config.model_dump())
        diff.update(secret_events)
        result = await self.db.execute(
            update(InstanceSettings)
            .where(InstanceSettings.id == 1, InstanceSettings.version == payload.version)
            .values(
                version=InstanceSettings.version + 1,
                settings=new_config.model_dump(mode="json"),
                updated_by=actor_id,
                updated_at=func.now(),
            )
        )
        if result.rowcount != 1:
            await self.db.rollback()
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="settings_version_conflict")
        self.db.add(
            InstanceSettingsAudit(
                actor_id=actor_id,
                config_version=payload.version + 1,
                diff=diff,
            )
        )
        await self.db.commit()
        invalidate_config_cache()
        return await self.read()

    async def history(self, limit: int = 50) -> list[AuditRead]:
        result = await self.db.execute(
            select(InstanceSettingsAudit)
            .order_by(InstanceSettingsAudit.id.desc())
            .limit(limit)
        )
        return [AuditRead.model_validate(item) for item in result.scalars().all()]

    @staticmethod
    def _safe_diff(old: dict[str, Any], new: dict[str, Any], prefix: str = "") -> dict[str, Any]:
        changed: dict[str, Any] = {}
        for key in sorted(set(old) | set(new)):
            path = f"{prefix}.{key}" if prefix else key
            left, right = old.get(key), new.get(key)
            if isinstance(left, dict) and isinstance(right, dict):
                changed.update(ConfigService._safe_diff(left, right, path))
            elif left != right:
                changed[path] = {"from": left, "to": right}
        return changed


async def setup_required(db: AsyncSession) -> bool:
    count = await db.scalar(
        select(func.count(User.id)).where(User.role == UserRole.ADMIN, User.is_active.is_(True))
    )
    return not bool(count)
