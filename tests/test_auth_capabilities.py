from datetime import datetime, timezone
from hashlib import sha256
from types import SimpleNamespace

from sqlalchemy import select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from modules.auth.models import AccessKey, AuthSession
from modules.users.models import User


def config(mode="password", registration=True):
    return SimpleNamespace(auth=SimpleNamespace(mode=mode, registration=registration))


async def test_disabled_password_login_and_registration_return_machine_codes(
    client, monkeypatch
):
    monkeypatch.setattr(
        "modules.auth.service.get_fuze_config", lambda: config("key", False)
    )
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "nobody@example.com", "password": "long-enough-password"},
    )
    registration = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Nobody",
            "email": "nobody@example.com",
            "password": "long-enough-password",
        },
    )
    assert login.status_code == 403
    assert login.json()["detail"] == "password_login_disabled"
    assert registration.status_code == 403
    assert registration.json()["detail"] == "registration_disabled"


async def test_key_login_links_session_and_revocation_is_immediate(
    client, test_engine, monkeypatch
):
    registered = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Key user",
            "email": "key@example.com",
            "password": "long-enough-password",
        },
    )
    assert registered.status_code == 200
    secret = "fuze_" + "a" * 43
    async with AsyncSession(test_engine, expire_on_commit=False) as db:
        user = (
            await db.execute(select(User).where(User.email == "key@example.com"))
        ).scalar_one()
        access_key = AccessKey(
            user_id=user.id,
            label="test",
            key_hash=sha256(secret.encode()).hexdigest(),
        )
        db.add(access_key)
        await db.commit()
        await db.refresh(access_key)
        key_id = access_key.id

    monkeypatch.setattr(
        "modules.auth.service.get_fuze_config", lambda: config("key", False)
    )
    response = await client.post("/api/v1/auth/key-login", json={"key": secret})
    assert response.status_code == 200
    assert response.json()["email"] == "key@example.com"

    async with AsyncSession(test_engine) as db:
        session = (
            await db.execute(
                select(AuthSession).where(AuthSession.access_key_id == key_id)
            )
        ).scalar_one()
        assert session.access_key_id == key_id
        now = datetime.now(timezone.utc)
        await db.execute(
            update(AccessKey).where(AccessKey.id == key_id).values(revoked_at=now)
        )
        await db.execute(
            update(AuthSession)
            .where(AuthSession.access_key_id == key_id)
            .values(revoked_at=now)
        )
        await db.commit()

    assert (await client.get("/api/v1/auth/me")).status_code == 401


async def test_key_login_disabled_in_password_mode(client):
    response = await client.post(
        "/api/v1/auth/key-login", json={"key": "fuze_" + "x" * 43}
    )
    assert response.status_code == 403
    assert response.json()["detail"] == "key_login_disabled"


async def test_admin_can_generate_key_user_on_site(client, test_engine):
    await client.post(
        "/api/v1/auth/register",
        json={
            "name": "Admin",
            "email": "admin@example.com",
            "password": "long-enough-password",
        },
    )
    async with AsyncSession(test_engine) as db:
        await db.execute(
            update(User).where(User.email == "admin@example.com").values(role="ADMIN")
        )
        await db.commit()
    login = await client.post(
        "/api/v1/auth/login",
        json={"email": "admin@example.com", "password": "long-enough-password"},
    )
    assert login.status_code == 200

    created = await client.post(
        "/api/v1/users/key",
        json={"name": "Invited listener", "role": "user", "label": "web invite"},
    )
    assert created.status_code == 201
    payload = created.json()
    assert payload["user"]["email"] is None
    assert payload["access_key"].startswith("fuze_")

    async with AsyncSession(test_engine) as db:
        stored = (
            await db.execute(
                select(AccessKey).where(AccessKey.user_id == payload["user"]["id"])
            )
        ).scalar_one()
        assert stored.label == "web invite"
        assert stored.key_hash == sha256(payload["access_key"].encode()).hexdigest()

    from modules.admin.service import invalidate_config_cache

    async with test_engine.begin() as conn:
        await conn.execute(
            text(
                "UPDATE instance_settings SET settings = jsonb_set(settings, '{auth,mode}', '\"key\"'::jsonb)"
            )
        )
    invalidate_config_cache()
    await client.post("/api/v1/auth/logout")
    key_login = await client.post(
        "/api/v1/auth/key-login", json={"key": payload["access_key"]}
    )
    assert key_login.status_code == 200
    assert key_login.json()["name"] == "Invited listener"
