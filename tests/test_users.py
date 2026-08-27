from unittest.mock import AsyncMock

import pytest
from fastapi import HTTPException

from core.dependencies import current_active_user, require_role
from core.enums import UserRole
from modules.users.models import User
from modules.users.schemas import UserCreate, UserUpdate
from modules.users.service import UserService


def test_user_create_normalizes_and_validates_fields():
    data = UserCreate(
        name="  Ada Lovelace  ",
        email="  ADA@EXAMPLE.COM ",
        password="correct-horse",
    )

    assert data.name == "Ada Lovelace"
    assert data.email == "ada@example.com"
    assert data.role == UserRole.USER


def test_user_update_uses_role_enum():
    data = UserUpdate(role="admin")
    assert data.role == UserRole.ADMIN


@pytest.mark.parametrize("page,size", [(1, 1), (3, 100)])
async def test_list_users_uses_stable_page_offset(page, size):
    repository = AsyncMock()
    repository.get_users.return_value = []
    repository.count_users.return_value = 0
    service = UserService(repository)

    await service.list_users(page=page, size=size)

    repository.get_users.assert_awaited_once_with(skip=(page - 1) * size, limit=size)


async def test_last_active_admin_cannot_be_deactivated():
    admin = User(
        id=1,
        email="admin@example.com",
        name="Admin",
        password="hash",
        role=UserRole.ADMIN,
        is_active=True,
    )
    repository = AsyncMock()
    repository.get_user_by_id.return_value = admin
    repository.lock_active_admin_ids.return_value = [admin.id]
    service = UserService(repository)

    with pytest.raises(HTTPException) as exc_info:
        await service.update_user(admin.id, UserUpdate(is_active=False))

    assert exc_info.value.status_code == 409
    repository.update_user.assert_not_awaited()


async def test_admin_can_be_deactivated_when_another_active_admin_exists():
    admin = User(
        id=1,
        email="admin@example.com",
        name="Admin",
        password="hash",
        role=UserRole.ADMIN,
        is_active=True,
    )
    repository = AsyncMock()
    repository.get_user_by_id.return_value = admin
    repository.lock_active_admin_ids.return_value = [1, 2]
    repository.update_user.return_value = admin
    service = UserService(repository)

    result = await service.update_user(admin.id, UserUpdate(is_active=False))

    assert result is admin
    assert result.is_active is False
    repository.commit.assert_awaited_once()


async def test_user_lookup_normalizes_email():
    repository = AsyncMock()
    repository.get_user_by_email.return_value = None
    service = UserService(repository)

    await service.get_user_by_email("  USER@EXAMPLE.COM ")

    repository.get_user_by_email.assert_awaited_once_with("user@example.com")


async def test_admin_satisfies_user_role_requirement():
    admin = User(
        id=1,
        email="admin@example.com",
        name="Admin",
        password="hash",
        role=UserRole.ADMIN,
        is_active=True,
    )

    result = await require_role(UserRole.USER)(admin)

    assert result is admin


async def test_user_does_not_satisfy_admin_role_requirement():
    user = User(
        id=2,
        email="user@example.com",
        name="User",
        password="hash",
        role=UserRole.USER,
        is_active=True,
    )

    with pytest.raises(HTTPException) as exc_info:
        await require_role(UserRole.ADMIN)(user)

    assert exc_info.value.status_code == 403


async def test_current_user_rejects_malformed_subject():
    user_service = AsyncMock()

    with pytest.raises(HTTPException) as exc_info:
        await current_active_user(
            type("Payload", (), {"sub": "not-an-id"})(), user_service
        )

    assert exc_info.value.status_code == 401
    user_service.get_user_by_id.assert_not_awaited()


async def test_current_user_rejects_inactive_database_user():
    user = User(
        id=2,
        email="user@example.com",
        name="User",
        password="hash",
        role=UserRole.USER,
        is_active=False,
    )
    user_service = AsyncMock()
    user_service.get_user_by_id.return_value = user

    with pytest.raises(HTTPException) as exc_info:
        await current_active_user(type("Payload", (), {"sub": "2"})(), user_service)

    assert exc_info.value.status_code == 401
