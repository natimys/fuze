from datetime import datetime, timezone
from uuid import UUID

from authx import TokenPayload
from fastapi import Depends, HTTPException, Request, status
from sqlalchemy.ext.asyncio import AsyncSession

from core.enums import UserRole
from core.security import jwt_security
from database.dependencies import get_db
from modules.auth.repository import AuthSessionRepository
from modules.users.dependencies import get_user_service
from modules.users.models import User
from modules.users.service import UserService


async def current_active_user(
    request: Request,
    payload: TokenPayload = Depends(jwt_security.access_token_required),
    user_service: UserService = Depends(get_user_service),
    db: AsyncSession = Depends(get_db),
) -> User:
    try:
        user_id = int(payload.sub)
        session_id = UUID(str(getattr(payload, "sid")))
    except (TypeError, ValueError, AttributeError, OverflowError):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        ) from None

    user = await user_service.get_user_by_id(user_id)
    if user is None or not user.is_active:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    session = await AuthSessionRepository(db).get(session_id)
    if (
        session is None
        or session.user_id != user_id
        or session.revoked_at is not None
        or session.expires_at <= datetime.now(timezone.utc)
    ):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid authentication credentials",
        )
    request.state.user_id = user.id
    return user


def require_role(*roles: UserRole):
    allowed_roles = set(roles)
    if UserRole.USER in allowed_roles:
        allowed_roles.add(UserRole.ADMIN)

    async def dependency(user: User = Depends(current_active_user)) -> User:
        if user.role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Forbidden")
        return user

    return dependency
