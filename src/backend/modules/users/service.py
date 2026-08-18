from fastapi import HTTPException, status
from sqlalchemy.exc import IntegrityError

from core.enums import UserRole
from core.exceptions import UserAlreadyExists
from core.security import hash_password

from .models import User
from .repository import UserRepository
from .schemas import UserUpdate


class UserService:
    def __init__(self, repository: UserRepository):
        self.repository = repository

    async def get_user_by_id(self, user_id: int) -> User | None:
        return await self.repository.get_user_by_id(user_id)

    async def get_user_by_email(self, email: str) -> User | None:
        return await self.repository.get_user_by_email(self._normalize_email(email))

    async def list_users(self, page: int = 1, size: int = 10) -> tuple[list[User], int]:
        skip = (page - 1) * size
        users = await self.repository.get_users(skip=skip, limit=size)
        total = await self.repository.count_users()
        return users, total

    async def register(self, email: str, name: str, password: str) -> User:
        email = self._normalize_email(email)
        user_exists = await self.repository.get_user_by_email(email)
        if user_exists:
            raise UserAlreadyExists()
        return await self._create_user(email, name, password, UserRole.USER)

    async def create_user(
        self, email: str, name: str, password: str, role: UserRole = UserRole.USER
    ) -> User:
        email = self._normalize_email(email)
        user_exists = await self.repository.get_user_by_email(email)
        if user_exists:
            raise UserAlreadyExists()
        return await self._create_user(email, name, password, role)

    async def update_user(self, user_id: int, data: UserUpdate) -> User | None:
        user = await self.repository.get_user_by_id(user_id)
        if not user:
            return None
        update_data = data.model_dump(exclude_unset=True)
        if "email" in update_data and update_data["email"] is not None:
            update_data["email"] = self._normalize_email(update_data["email"])
        if "password" in update_data and update_data["password"] is not None:
            update_data["password"] = hash_password(
                update_data["password"].get_secret_value()
            )
        elif "password" in update_data:
            del update_data["password"]
        removes_admin = (
            user.role == UserRole.ADMIN
            and user.is_active
            and (
                update_data.get("role", UserRole.ADMIN) != UserRole.ADMIN
                or update_data.get("is_active", True) is False
            )
        )
        if removes_admin:
            await self._ensure_not_last_active_admin(user.id)

        for key, value in update_data.items():
            if value is not None and hasattr(user, key):
                setattr(user, key, value)
        try:
            await self.repository.update_user(user)
            await self.repository.commit()
            await self.repository.refresh(user)
        except IntegrityError:
            await self.repository.rollback()
            raise UserAlreadyExists() from None
        return user

    async def delete_user(self, user_id: int) -> bool:
        user = await self.repository.get_user_by_id(user_id)
        if not user:
            return False
        if user.role == UserRole.ADMIN and user.is_active:
            await self._ensure_not_last_active_admin(user.id)
        await self.repository.delete_user(user)
        await self.repository.commit()
        return True

    async def _create_user(
        self, email: str, name: str, password: str, role: UserRole
    ) -> User:
        try:
            user = await self.repository.create_user(
                email=email,
                name=name.strip(),
                password=hash_password(password),
                role=role,
            )
            await self.repository.commit()
            await self.repository.refresh(user)
            return user
        except IntegrityError:
            await self.repository.rollback()
            raise UserAlreadyExists() from None

    async def _ensure_not_last_active_admin(self, user_id: int) -> None:
        active_admin_ids = await self.repository.lock_active_admin_ids()
        if user_id in active_admin_ids and len(active_admin_ids) <= 1:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="The last active administrator cannot be changed",
            )

    @staticmethod
    def _normalize_email(email: str) -> str:
        return str(email).strip().lower()
