from fastapi import Depends
from sqlalchemy.ext.asyncio import AsyncSession

from database.dependencies import get_db
from modules.auth.repository import AuthSessionRepository
from modules.auth.service import AuthService
from modules.users.repository import UserRepository
from modules.users.service import UserService


def get_auth_service(
    db: AsyncSession = Depends(get_db),
) -> AuthService:
    return AuthService(
        UserService(UserRepository(db)),
        AuthSessionRepository(db),
    )
