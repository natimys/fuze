from httpx import ASGITransport, AsyncClient


async def test_register_creates_key_only_identity(client):
    response = await client.post(
        "/api/v1/auth/register",
        json={
            "name": "  Test User  ",
        },
    )

    assert response.status_code == 200
    payload = response.json()
    assert payload["user"]["name"] == "Test User"
    assert payload["user"]["email"] is None
    assert payload["access_key"].startswith("fuze_")


async def test_login_returns_user_and_http_only_cookies(existing_user):
    response = await existing_user.post(
        "/api/v1/auth/login",
        json={"email": "TEST@EMAIL.COM", "password": "test_password123"},
    )

    assert response.status_code == 200
    assert "access_token" not in response.json()
    assert "refresh_token" not in response.json()
    assert response.json()["email"] == "test@email.com"
    set_cookie = response.headers.get_list("set-cookie")
    assert any("access_token=" in value and "HttpOnly" in value for value in set_cookie)
    assert any(
        "refresh_token=" in value and "HttpOnly" in value for value in set_cookie
    )
    assert any(
        "access_token=" in value and "Max-Age=2592000" in value
        for value in set_cookie
    )
    assert any(
        "refresh_token=" in value and "Max-Age=2592000" in value
        for value in set_cookie
    )
    assert any(
        "refresh_token=" in value and "Path=/api/v1/auth/refresh" in value
        for value in set_cookie
    )
    assert any(
        "csrf_refresh_token=" in value and "Path=/" in value for value in set_cookie
    )
    assert "csrf_access_token" in existing_user.cookies
    assert "csrf_refresh_token" in existing_user.cookies


async def test_login_removes_legacy_root_refresh_cookie(existing_user):
    existing_user.cookies.set(
        "refresh_token", "legacy", domain="test.local", path="/"
    )

    response = await existing_user.post(
        "/api/v1/auth/login",
        json={"email": "test@email.com", "password": "test_password123"},
    )

    assert response.status_code == 200
    set_cookie = response.headers.get_list("set-cookie")
    assert any(
        "refresh_token=" in value
        and "Max-Age=0" in value
        and "Path=/" in value
        and "Path=/api/v1/auth/refresh" not in value
        for value in set_cookie
    )
    refresh_cookies = [
        cookie
        for cookie in existing_user.cookies.jar
        if cookie.name == "refresh_token"
    ]
    assert len(refresh_cookies) == 1
    assert refresh_cookies[0].path == "/api/v1/auth/refresh"
    assert refresh_cookies[0].value != "legacy"


async def test_me_uses_cookie_auth(existing_user):
    response = await existing_user.get("/api/v1/auth/me")

    assert response.status_code == 200
    assert response.json()["email"] == "test@email.com"


async def test_bearer_token_is_not_accepted(existing_user):
    access_token = existing_user.cookies["access_token"]
    existing_user.cookies.clear()

    response = await existing_user.get(
        "/api/v1/auth/me", headers={"Authorization": f"Bearer {access_token}"}
    )

    assert response.status_code == 401


async def test_invalid_access_token_triggers_refresh_status(existing_user):
    existing_user.cookies.set("access_token", "invalid", path="/")

    response = await existing_user.get("/api/v1/auth/me")

    assert response.status_code == 401
    assert response.json()["error_type"] == "JWTDecodeError"


async def test_refresh_rotates_refresh_token(existing_user):
    old_refresh = existing_user.cookies["refresh_token"]

    response = await existing_user.post("/api/v1/auth/refresh")

    assert response.status_code == 204
    assert response.content == b""
    assert existing_user.cookies["refresh_token"] != old_refresh


async def test_refresh_recovers_from_legacy_duplicate_cookie(existing_user):
    existing_user.cookies.set(
        "refresh_token", "legacy", domain="test.local", path="/"
    )

    response = await existing_user.post("/api/v1/auth/refresh")

    assert response.status_code == 204
    refresh_cookies = [
        cookie
        for cookie in existing_user.cookies.jar
        if cookie.name == "refresh_token"
    ]
    assert len(refresh_cookies) == 1
    assert refresh_cookies[0].path == "/api/v1/auth/refresh"
    assert refresh_cookies[0].value != "legacy"


async def test_old_refresh_token_cannot_be_reused(existing_user):
    from main import app

    old_refresh = existing_user.cookies["refresh_token"]
    old_csrf = existing_user.cookies["csrf_refresh_token"]
    assert (await existing_user.post("/api/v1/auth/refresh")).status_code == 204

    async with AsyncClient(
        transport=ASGITransport(app=app), base_url="https://test"
    ) as replay:
        replay.cookies.set("refresh_token", old_refresh, path="/api/v1/auth/refresh")
        replay.cookies.set("csrf_refresh_token", old_csrf, path="/")
        response = await replay.post(
            "/api/v1/auth/refresh", headers={"X-CSRF-TOKEN": old_csrf}
        )

    assert response.status_code == 401


async def test_refresh_rejects_missing_or_wrong_csrf(existing_user):
    from main import app

    async with AsyncClient(
        transport=ASGITransport(app=app),
        base_url="https://test",
        cookies=existing_user.cookies,
    ) as browser:
        missing = await browser.post("/api/v1/auth/refresh")
        wrong = await browser.post(
            "/api/v1/auth/refresh", headers={"X-CSRF-TOKEN": "wrong"}
        )

    assert missing.status_code == 401
    assert wrong.status_code == 401


async def test_logout_revokes_session_and_clears_cookies(existing_user):
    response = await existing_user.post("/api/v1/auth/logout")

    assert response.status_code == 204
    assert "access_token" not in existing_user.cookies
    assert "refresh_token" not in existing_user.cookies


async def test_login_rejects_invalid_password_shape(client):
    response = await client.post(
        "/api/v1/auth/login",
        json={"email": "inactive@example.com", "password": "short"},
    )
    assert response.status_code == 422
