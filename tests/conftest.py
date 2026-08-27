import os
from pathlib import Path

# Application-level limits make the suite order-dependent because all test clients
# share one Redis instance and IP. Set overrides before importing core.security:
# that module constructs AuthX and caches Settings during import.
os.environ["AUTH_RATE_LIMIT_REQUESTS"] = "0"
os.environ["SEARCH_RATE_LIMIT_REQUESTS"] = "0"
os.environ["ACQUIRE_RATE_LIMIT_REQUESTS"] = "0"

import pytest
from alembic import command
from alembic.config import Config
from httpx import AsyncClient, ASGITransport
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from core.settings import TestSettings
from core.security import hash_password
from database.base import Base
from database.dependencies import get_db

ROOT_DIR = Path(__file__).resolve().parent.parent
TEST_INSTANCE_SETTINGS = (
    '{"instance_name":"Fuze","auth":{"mode":"both","registration":true},'
    '"features":{"playback":true},"providers":{"youtube":true,"yandex":false,'
    '"spotify":false,"spotify_market":"US"}}'
)


@pytest.fixture(scope="session")
def test_settings() -> TestSettings:
    return TestSettings()


@pytest.fixture(scope="session")
async def test_engine(test_settings: TestSettings):
    config = Config(str(ROOT_DIR / "src" / "backend" / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", test_settings.TEST_ALEMBIC_DATABASE_URL)
    command.upgrade(config, "head")
    engine = create_async_engine(test_settings.TEST_DATABASE_URL, echo=False)
    # Product defaults disable public registration. Most legacy auth tests
    # exercise the registration flow itself, so this fixture explicitly enables
    # that capability for their isolated database.
    async with engine.begin() as conn:
        await conn.execute(
            text(
                "INSERT INTO instance_settings (id, version, settings) VALUES "
                "(1, 1, CAST(:settings AS jsonb)) ON CONFLICT (id) DO UPDATE SET "
                "version = EXCLUDED.version, settings = EXCLUDED.settings, updated_by = NULL"
            ),
            {
                "settings": TEST_INSTANCE_SETTINGS
            },
        )
    yield engine
    await engine.dispose()


@pytest.fixture
async def clean_tables(test_engine):
    yield
    async with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            if table.name == "instance_settings":
                continue
            await conn.execute(table.delete())
        await conn.execute(
            text("UPDATE instance_settings SET version=1, settings=CAST(:settings AS jsonb), updated_by=NULL"),
            {"settings": TEST_INSTANCE_SETTINGS},
        )
    from modules.admin.service import invalidate_config_cache

    invalidate_config_cache()


@pytest.fixture
async def client(test_engine, clean_tables):
    from main import app

    async def override_get_db():
        async with AsyncSession(bind=test_engine, expire_on_commit=False) as session:
            yield session

    async def add_csrf_header(request):
        if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
            return

        cookie_name = (
            "csrf_refresh_token"
            if request.url.path == "/api/v1/auth/refresh"
            else "csrf_access_token"
        )
        csrf = ac.cookies.get(cookie_name)
        if csrf:
            request.headers["X-CSRF-TOKEN"] = csrf

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://test",
        event_hooks={"request": [add_csrf_header]},
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def existing_user(client, test_engine):
    async with test_engine.begin() as connection:
        await connection.execute(
            text(
                "INSERT INTO users (email, name, password, role, is_active) "
                "VALUES (:email, :name, :password, 'USER', true)"
            ),
            {
                "email": "test@email.com",
                "name": "test_name",
                "password": hash_password("test_password123"),
            },
        )
    login_response = await client.post(
        "/api/v1/auth/login",
        json={
            "email": "test@email.com",
            "password": "test_password123",
        },
    )
    assert login_response.status_code == 200
    return client
