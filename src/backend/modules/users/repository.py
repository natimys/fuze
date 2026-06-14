from sqlalchemy import func, select

from .models import User
from core.enums import UserRole


class UserRepository:
    def __init__(self, db):
        self.db = db

    async def get_user_by_email(self, email: str) -> User | None:
        query = select(User).where(User.email == email)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_user_by_id(self, user_id: int) -> User | None:
        query = select(User).where(User.id == user_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def get_users(self, skip: int = 0, limit: int = 10) -> list[User]:
        query = select(User).offset(skip).limit(limit)
        result = await self.db.execute(query)
        return list(result.scalars().all())

    async def count_users(self) -> int:
        query = select(func.count(User.id))
        result = await self.db.execute(query)
        return result.scalar_one()

    async def create_user(
        self, email: str, name: str, password: str, role: UserRole
    ) -> User:
        new_user = User(email=email, name=name, password=password, role=role)
        self.db.add(new_user)
        await self.db.commit()
        await self.db.refresh(new_user)
        return new_user

    async def update_user(self, user: User) -> User:
        await self.db.commit()
        await self.db.refresh(user)
        return user

    async def delete_user(self, user: User) -> None:
        await self.db.delete(user)
        await self.db.commit()
