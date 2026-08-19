from pydantic import BaseModel, EmailStr, Field, SecretStr, field_validator

from core.enums import UserRole


class UserRegister(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    email: EmailStr
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("name", mode="before")
    @classmethod
    def strip_name(cls, value: str) -> str:
        return value.strip()

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class UserLogin(BaseModel):
    email: EmailStr
    password: SecretStr = Field(min_length=8, max_length=128)

    @field_validator("email", mode="before")
    @classmethod
    def normalize_email(cls, value: str) -> str:
        return value.strip().lower()


class KeyLogin(BaseModel):
    key: SecretStr = Field(min_length=32, max_length=512)


class UserPublic(BaseModel):
    id: int
    name: str
    email: EmailStr | None
    role: UserRole
    is_active: bool

    model_config = {"from_attributes": True}
