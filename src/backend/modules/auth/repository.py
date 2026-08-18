from datetime import datetime
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AuthSession


class AuthSessionRepository:
    def __init__(self, db: AsyncSession):
        self.db = db

    async def create(
        self,
        *,
        session_id: UUID,
        user_id: int,
        refresh_jti_hash: str,
        expires_at: datetime,
    ) -> AuthSession:
        session = AuthSession(
            id=session_id,
            user_id=user_id,
            refresh_jti_hash=refresh_jti_hash,
            expires_at=expires_at,
        )
        self.db.add(session)
        await self.db.flush()
        return session

    async def get_for_update(self, session_id: UUID) -> AuthSession | None:
        result = await self.db.execute(
            select(AuthSession).where(AuthSession.id == session_id).with_for_update()
        )
        return result.scalar_one_or_none()

    async def get(self, session_id: UUID) -> AuthSession | None:
        return await self.db.get(AuthSession, session_id)

    async def commit(self) -> None:
        await self.db.commit()

    async def rollback(self) -> None:
        await self.db.rollback()
