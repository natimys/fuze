from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from modules.auth.models import AccessKey
from .models import User
from core.enums import UserRole


class UserRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def get_user_by_email(self, email: str) -> User | None:
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: int) -> User | None:
        query = select(User).where(User.id == user_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_users(
        self, skip: int = 0, limit: int = 10, search: str = ""
    ) -> list[User]:
        query = select(User)
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(User.name.ilike(pattern), User.email.ilike(pattern))
            )
        query = query.order_by(User.id).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_users(self, search: str = "") -> int:
        query = select(func.count(User.id))
        if search:
            pattern = f"%{search}%"
            query = query.where(
                or_(User.name.ilike(pattern), User.email.ilike(pattern))
            )
        result = await self.db.execute(query)
        return result.scalar_one()

    async def create_user(
        self, email: str | None, name: str, password: str | None, role: UserRole
    ) -> User:
        new_user = User(email=email, name=name, password=password, role=role)
        self.db.add(new_user)
        await self.db.flush()
        return new_user

    async def create_access_key(
        self, *, user_id: int, label: str, key_hash: str
    ) -> AccessKey:
        access_key = AccessKey(user_id=user_id, label=label, key_hash=key_hash)
        self.db.add(access_key)
        await self.db.flush()
        return access_key

    async def update_user(self, user: User) -> User:
        await self.db.flush()
        return user

    async def delete_user(self, user: User) -> None:
        await self.db.delete(user)
        await self.db.flush()

    async def lock_active_admin_ids(self) -> list[int]:
        result = await self.db.execute(
            select(User.id)
            .where(User.role == UserRole.ADMIN, User.is_active.is_(True))
            .order_by(User.id)
            .with_for_update()
        )
        return list(result.scalars().all())

    async def commit(self) -> None:
        await self.db.commit()

    async def rollback(self) -> None:
        await self.db.rollback()

    async def refresh(self, user: User) -> None:
        await self.db.refresh(user)
