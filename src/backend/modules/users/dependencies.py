from fastapi import Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from core.enums import UserRole
from core.security import jwt_security
from database.dependencies import get_db
from modules.users.repository import UserRepository
from modules.users.service import UserService
from authx import TokenPayload

def require_role(*roles: UserRole):
    allowed_roles = {r.value for r in roles}

    async def dependency(
        payload: TokenPayload = Depends(jwt_security.access_token_required)
    ):
        user_role = getattr(payload, "role", None)
        
        if user_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Forbidden")
            
        return payload

    return dependency


def get_user_repository(db: AsyncSession = Depends(get_db)) -> UserRepository:
    return UserRepository(db)


async def get_user_service(db: AsyncSession = Depends(get_db)) -> UserService:
    return UserService(UserRepository(db))
