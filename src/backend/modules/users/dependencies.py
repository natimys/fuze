from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.enums import UserRole
from core.security import jwt_security
from database.dependencies import get_db
from modules.users.repository import UserRepository
from modules.users.service import UserService


def require_role(*roles: UserRole):
    async def dependency(
            payload=Depends(jwt_security.access_token_required),
            user_service: UserService = Depends(get_user_service),
    ):
        user = await user_service.get_user_by_id(int(payload.sub))
        if user.role not in roles:
            raise HTTPException(status_code=403)
        return user

    return dependency


def get_user_repository(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


async def get_user_service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(UserRepository(db))
