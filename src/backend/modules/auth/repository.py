from datetime import datetime
from uuid import UUID

from sqlalchemy import select, update
from sqlalchemy.ext.asyncio import AsyncSession

from .models import AccessKey, AuthSession


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
        access_key_id: UUID | None = None,
    ) -> AuthSession:
        session = AuthSession(
            id=session_id,
            user_id=user_id,
            refresh_jti_hash=refresh_jti_hash,
            expires_at=expires_at,
            access_key_id=access_key_id,
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

    async def get_access_key_for_update(self, key_hash: str) -> AccessKey | None:
        result = await self.db.execute(
            select(AccessKey)
            .where(AccessKey.key_hash == key_hash)
            .with_for_update()
        )
        return result.scalar_one_or_none()

    async def mark_key_used(self, key: AccessKey, used_at: datetime) -> None:
        key.last_used_at = used_at
        await self.db.flush()

    async def revoke_sessions_for_key(self, key_id: UUID, revoked_at: datetime) -> None:
        await self.db.execute(
            update(AuthSession)
            .where(
                AuthSession.access_key_id == key_id,
                AuthSession.revoked_at.is_(None),
            )
            .values(revoked_at=revoked_at)
        )

    async def commit(self) -> None:
        await self.db.commit()

    async def rollback(self) -> None:
        await self.db.rollback()
