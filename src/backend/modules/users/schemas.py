from pydantic import BaseModel, EmailStr, SecretStr

from core.enums import UserRole


class UserRead(BaseModel):
    id: int
    name: str
    email: str
    role: str
    is_active: bool = True

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str
    email: EmailStr
    password: SecretStr
    role: UserRole = UserRole.USER


class UserUpdate(BaseModel):
    name: str | None = None
    email: EmailStr | None = None
    password: SecretStr | None = None
    role: str | None = None
    is_active: bool | None = None


class UsersResponse(BaseModel):
    data: list[UserRead]
    total: int
    page: int
    size: int
