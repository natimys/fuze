from core.enums import UserRole
from core.exceptions import InvalidAuthCredentials
from core.security import jwt_security, verify_password

from modules.auth.schemas import UserLogin, UserRegister
from modules.users.models import User
from modules.users.service import UserService


class AuthService:
    def __init__(self, user_service: UserService):
        self.user_service = user_service

    def generate_tokens(self, user_id: int, user_role: UserRole | None = None) -> tuple[str, str]:
        uid_str = str(user_id)
        token_data = {"role": user_role.value} if user_role else {}
        access_token = jwt_security.create_access_token(uid, data=token_data)
        refresh_token = jwt_security.create_refresh_token(uid=uid_str)
        return access_token, refresh_token

    async def register(self, data: UserRegister) -> User:
        user = await self.user_service.register(
            email=data.email, name=data.name, password=data.password.get_secret_value()
        )
        return user

    async def authenticate(self, data: UserLogin) -> tuple[str, str]:
        user = await self.user_service.get_user_by_email(data.email)

        if not user:
            raise InvalidAuthCredentials()

        password = data.password.get_secret_value()
        if not verify_password(plain_password=password, hashed_password=user.password):
            raise InvalidAuthCredentials()

        return self.generate_tokens(user.id, user_role=user.role)