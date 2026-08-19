from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator

from core.enums import UserRole


class UserRead(BaseModel):
    id: int
    name: str
    email: str | None
    role: UserRole
    is_active: bool = True

    model_config = {"from_attributes": True}


class UserCreate(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: SecretStr = Field(min_length=8, max_length=128)
    role: UserRole = UserRole.USER

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserUpdate(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    email: EmailStr | None = None
    password: SecretStr | None = Field(default=None, min_length=8, max_length=128)
    role: UserRole | None = None
    is_active: bool | None = None

    @field_validator("name", mode="before")
    @classmethod
    def strip_optional_name(cls, value: str | None) -> str | None:
        return value.strip() if value is not None else None

    @field_validator("email", mode="before")
    @classmethod
    def normalize_optional_email(cls, value: str | None) -> str | None:
        return value.strip().lower() if value is not None else None


class UsersResponse(BaseModel):
    data: list[UserRead]
    total: int
    page: int
    size: int
