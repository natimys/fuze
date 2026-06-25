from authx import TokenPayload
from fastapi import Depends, HTTPException

from core.enums import UserRole
from core.security import jwt_security


def require_role(*roles: UserRole):
    allowed_roles = {r.value for r in roles}

    async def dependency(
        payload: TokenPayload = Depends(jwt_security.access_token_required)
    ):
        user_role = getattr(payload, "role", None)

        if user_role not in allowed_roles:
            raise HTTPException(status_code=403, detail="Forbidden")

        return payload

    return dependency
