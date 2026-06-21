from fastapi import APIRouter, Depends, HTTPException

from core.enums import UserRole
from .dependencies import get_user_service, require_role
from .module import module
from .schemas import UserCreate, UserRead, UsersResponse, UserUpdate
from .service import UserService

router = APIRouter(
    prefix=module.router_prefix,
    tags=module.router_tags,
    dependencies=[Depends(require_role(UserRole.ADMIN))],
)


@router.get("/", response_model=UsersResponse)
async def list_users(
        page: int = 1,
        size: int = 10,
        user_service: UserService = Depends(get_user_service),
):
    users, total = await user_service.list_users(page=page, size=size)
    return UsersResponse(data=users, total=total, page=page, size=size)


@router.get("/{user_id}", response_model=UserRead)
async def get_user(
        user_id: int,
        user_service: UserService = Depends(get_user_service),
):
    user = await user_service.get_user_by_id(user_id)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/", response_model=UserRead, status_code=201)
async def create_user(
        data: UserCreate,
        user_service: UserService = Depends(get_user_service),
):
    user = await user_service.create_user(
        email=data.email,
        name=data.name,
        password=data.password.get_secret_value(),
        role=data.role,
    )
    return user


@router.patch("/{user_id}", response_model=UserRead)
async def update_user(
        user_id: int,
        data: UserUpdate,
        user_service: UserService = Depends(get_user_service),
):
    user = await user_service.update_user(user_id, data)
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.delete("/{user_id}", status_code=204)
async def delete_user(
        user_id: int,
        user_service: UserService = Depends(get_user_service),
):
    deleted = await user_service.delete_user(user_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="User not found")
