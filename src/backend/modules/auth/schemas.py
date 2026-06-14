from pydantic import BaseModel, EmailStr, SecretStr


class UserRegister(BaseModel):
    name: str
    email: EmailStr
    password: SecretStr


class UserLogin(BaseModel):
    email: EmailStr
    password: SecretStr


class UserPublic(BaseModel):
    name: str
    email: EmailStr
