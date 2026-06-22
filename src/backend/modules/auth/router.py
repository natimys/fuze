from fastapi import APIRouter, Depends, Response

from core.security import jwt_security
from .dependencies import (
    get_auth_service,
)
from .module import module
from .schemas import UserPublic, UserRegister, UserLogin
from .service import AuthService
from ..users.dependencies import get_user_service
from ..users.service import UserService

router = APIRouter(prefix=module.router_prefix, tags=module.router_tags)


@router.post("/register/", response_model=UserPublic)
async def register(
        data: UserRegister, auth_service: AuthService = Depends(get_auth_service)
):
    user = await auth_service.register(data)
    return user


@router.get("/me/", response_model=UserPublic)
async def me(
        payload=Depends(jwt_security.access_token_required),
        user_service: UserService = Depends(get_user_service),
):
    return await user_service.get_user_by_id(int(payload.sub))


@router.post("/refresh/")
async def refresh(
        response: Response,
        payload=Depends(jwt_security.refresh_token_required),
        auth_service: AuthService = Depends(get_auth_service),
        user_service: UserService = Depends(get_user_service),
):
    user = await user_service.get_user_by_id(int(payload.sub))
    access_token, refresh_token = auth_service.generate_tokens(user.id, user_role=user.role)

    jwt_security.set_access_cookies(access_token, response)
    jwt_security.set_refresh_cookies(refresh_token, response)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
    }


@router.post("/login/")
async def login(data: UserLogin, response: Response, auth_service: AuthService = Depends(get_auth_service)):
    access_token, refresh_token = await auth_service.authenticate(data)

    jwt_security.set_access_cookies(access_token, response)
    jwt_security.set_refresh_cookies(refresh_token, response)
    return {
        "access_token": access_token,
        "refresh_token": refresh_token,
    }


@router.post("/logout/", status_code=204)
async def logout(response: Response):
    jwt_security.unset_refresh_cookies(response)
    jwt_security.unset_access_cookies(response)
