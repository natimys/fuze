import pytest
from fastapi import HTTPException
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from core.instance_config import AuthConfig, FeaturesConfig, ProvidersConfig
from modules.admin.schemas import CredentialWrite, SettingsWrite
from modules.admin.service import ConfigCipher, ConfigService, invalidate_config_cache


async def _actor(session: AsyncSession) -> int:
    return await session.scalar(
        text(
            "INSERT INTO users (email, name, password, role, is_active) "
            "VALUES ('config-admin@example.com', 'Config Admin', 'not-used', 'ADMIN', true) RETURNING id"
        )
    )


def _payload(version: int, *, yandex: bool, credentials: CredentialWrite | None = None, name: str = "Fuze"):
    return SettingsWrite(
        version=version,
        instance_name=name,
        auth=AuthConfig(mode="password", registration=False),
        features=FeaturesConfig(playback=True),
        providers=ProvidersConfig(youtube=True, yandex=yandex, spotify=False, spotify_market="US"),
        credentials=credentials,
    )


@pytest.mark.asyncio
async def test_secret_add_preserve_remove_and_version_conflict(test_engine, clean_tables):
    invalidate_config_cache()
    cipher = ConfigCipher("unit-test-config-encryption-key-at-least-32")
    async with AsyncSession(bind=test_engine, expire_on_commit=False) as session:
        actor_id = await _actor(session)
        await session.commit()
        service = ConfigService(session, cipher)
        initial = await service.read()

        saved = await service.update(
            _payload(initial.version, yandex=True, credentials=CredentialWrite(yandex_token="provider-secret-value")),
            actor_id,
        )
        assert saved.version == initial.version + 1
        assert saved.credentials["yandex_token"].configured is True
        ciphertext = await session.scalar(text("SELECT ciphertext FROM instance_secrets WHERE name='yandex_token'"))
        assert ciphertext != "provider-secret-value"
        assert "provider-secret-value" not in ciphertext
        assert (await service.get_snapshot(fresh=True)).secrets["yandex_token"] == "provider-secret-value"

        preserved = await service.update(_payload(saved.version, yandex=True, name="Preserved"), actor_id)
        assert preserved.credentials["yandex_token"].configured is True

        with pytest.raises(HTTPException) as conflict:
            await service.update(_payload(saved.version, yandex=False), actor_id)
        assert conflict.value.status_code == 409

        removed = await service.update(
            _payload(preserved.version, yandex=False, credentials=CredentialWrite(yandex_token=None)),
            actor_id,
        )
        assert removed.credentials["yandex_token"].configured is False
        assert await session.scalar(text("SELECT count(*) FROM instance_secrets WHERE name='yandex_token'")) == 0
        audit = await session.execute(text("SELECT diff::text FROM instance_settings_audit ORDER BY id"))
        audit_text = " ".join(audit.scalars().all())
        assert "provider-secret-value" not in audit_text
        assert "credential_added" in audit_text
        assert "credential_removed" in audit_text


@pytest.mark.asyncio
async def test_provider_cannot_be_enabled_without_credentials(test_engine, clean_tables):
    invalidate_config_cache()
    async with AsyncSession(bind=test_engine, expire_on_commit=False) as session:
        actor_id = await _actor(session)
        await session.commit()
        service = ConfigService(session, ConfigCipher("unit-test-config-encryption-key-at-least-32"))
        initial = await service.read()
        with pytest.raises(HTTPException) as error:
            await service.update(_payload(initial.version, yandex=True), actor_id)
        assert error.value.status_code == 422
        assert error.value.detail == "yandex_credentials_required"


@pytest.mark.asyncio
async def test_non_admin_cannot_read_instance_settings(existing_user):
    response = await existing_user.get("/api/v1/admin/settings")
    assert response.status_code == 403
    assert response.json()["detail"] == "Forbidden"
