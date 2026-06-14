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


async def login_and_set_cookies(
    response: Response,
    data: UserLogin,
    auth_service: AuthService = Depends(get_auth_service),
) -> type[UserLogin]:
    access_token, refresh_token = await auth_service.authenticate(data)
    jwt_security.set_access_cookies(access_token, response)
    jwt_security.set_refresh_cookies(refresh_token, response)
    return UserLogin


async def refresh_session_and_set_cookies(
    response: Response,
    payload = Depends(jwt_security.refresh_token_required),
    auth_service: AuthService = Depends(get_auth_service),
    user_service: UserService = Depends(get_user_service),
):
    user = await user_service.get_user_by_id(int(payload.sub))
    access_token, refresh_token = auth_service.generate_tokens(user.id, user_role=user.role)

    jwt_security.set_access_cookies(access_token, response)
    jwt_security.set_refresh_cookies(refresh_token, response)

    return {"message": "token refreshed"}
