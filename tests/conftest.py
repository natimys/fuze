import pytest
from httpx import AsyncClient, ASGITransport
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine

from core.settings import TestSettings
from database.base import Base
from database.dependencies import get_db
from main import app

settings = TestSettings()
test_engine = create_async_engine(settings.TEST_DATABASE_URL, echo=True)


@pytest.fixture(autouse=True)
async def setup_db():
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await test_engine.dispose()


@pytest.fixture(autouse=True)
async def clean_tables():
    yield
    async with test_engine.begin() as conn:
        for table in reversed(Base.metadata.sorted_tables):
            await conn.execute(table.delete())


@pytest.fixture
async def client():
    async def override_get_db():
        async with AsyncSession(bind=test_engine) as session:
            yield session

    async def add_csrf_header(request):
        if request.method not in ("POST", "PUT", "PATCH", "DELETE"):
            return

        cookie_name = "csrf_refresh_token" if request.url.path == "/auth/refresh/" else "csrf_access_token"
        csrf = ac.cookies.get(cookie_name)
        if csrf:
            request.headers["X-CSRF-TOKEN"] = csrf

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(
            transport=ASGITransport(app=app),
            base_url="https://test",
            event_hooks={"request": [add_csrf_header]}
    ) as ac:
        yield ac
    app.dependency_overrides.clear()


@pytest.fixture
async def existing_user(client):
    register_response = await client.post(
        '/auth/register/',
        json={
            "name": "test_name",
            "email": "test@email.com",
            "password": "test_password123",
        }
    )
    assert register_response.status_code == 200
    login_response = await client.post(
        "/auth/login/",
        json={
            "email": "test@email.com",
            "password": "test_password123",
        }
    )
    assert login_response.status_code == 200
    return client
