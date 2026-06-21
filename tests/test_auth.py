async def test_register(client):
    register_response = await client.post(
        "/auth/register/",
        json={
            "name": "test_name",
            "email": "test@email.com",
            "password": "test_password123",
        }
    )
    assert register_response.status_code == 200


async def test_login(existing_user):
    cookies = existing_user.cookies
    assert "access_token" in cookies
    assert "refresh_token" in cookies
    assert "csrf_access_token" in cookies


async def test_me(existing_user):
    me_response = await existing_user.get("/auth/me/")
    assert me_response.status_code == 200
    assert "name" in me_response.json()
    assert "email" in me_response.json()


async def test_logout(existing_user):
    logout_response = await existing_user.post("/auth/logout/")
    assert logout_response.status_code == 204


async def test_refresh(existing_user):
    refresh_response = await existing_user.post("/auth/refresh/")
    print(refresh_response.json())
    assert refresh_response.status_code == 200