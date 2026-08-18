from authx import TokenPayload
from fastapi import APIRouter, Depends, Response, status

from core.dependencies import current_active_user
from core.rate_limit import auth_rate_limit
from core.security import jwt_security
from .dependencies import (
    get_auth_service,
)
from .module import module
from .schemas import UserPublic, UserRegister, UserLogin
from .service import AuthService
from ..users.models import User

router = APIRouter(prefix=module.router_prefix, tags=module.router_tags)


@router.post("/register", response_model=UserPublic)
async def register(
    data: UserRegister,
    _rate_limit: None = Depends(auth_rate_limit),
    auth_service: AuthService = Depends(get_auth_service),
):
    user = await auth_service.register(data)
    return user


@router.get("/me", response_model=UserPublic)
async def me(
    user: User = Depends(current_active_user),
):
    return user


@router.post("/refresh", status_code=status.HTTP_204_NO_CONTENT)
async def refresh(
    response: Response,
    payload: TokenPayload = Depends(jwt_security.refresh_token_required),
    auth_service: AuthService = Depends(get_auth_service),
):
    access_token, refresh_token = await auth_service.rotate(payload)

    jwt_security.set_access_cookies(access_token, response)
    jwt_security.set_refresh_cookies(refresh_token, response)


@router.post("/login", response_model=UserPublic)
async def login(
    data: UserLogin,
    response: Response,
    _rate_limit: None = Depends(auth_rate_limit),
    auth_service: AuthService = Depends(get_auth_service),
):
    user, access_token, refresh_token = await auth_service.authenticate(data)

    jwt_security.set_access_cookies(access_token, response)
    jwt_security.set_refresh_cookies(refresh_token, response)
    return user


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    response: Response,
    payload: TokenPayload = Depends(jwt_security.access_token_required),
    auth_service: AuthService = Depends(get_auth_service),
):
    await auth_service.revoke(payload)
    jwt_security.unset_refresh_cookies(response)
    jwt_security.unset_access_cookies(response)
