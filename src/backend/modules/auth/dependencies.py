from authx import TokenPayload
from core.security import jwt_security
from fastapi import Depends, Response

from modules.auth.schemas import UserLogin
from modules.auth.service import AuthService
from modules.users.dependencies import get_user_service
from modules.users.models import User
from modules.users.service import UserService


def get_auth_service(
    user_service: UserService = Depends(get_user_service),
) -> AuthService:
    return AuthService(user_service)


async def get_current_user(
    token: TokenPayload = Depends(jwt_security),
    user_service: UserService = Depends(get_user_service),
) -> User:
    user_id = int(token.sub)
    user = await user_service.get_user_by_id(user_id)
    return user






