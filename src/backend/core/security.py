from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerifyMismatchError
from authx import AuthX, AuthXConfig

_ph = PasswordHasher()


def _make_jwt_security() -> AuthX:
    from core.settings import get_settings

    settings = get_settings()
    config = AuthXConfig(
        JWT_SECRET_KEY=settings.JWT_SECURITY_KEY.get_secret_value(),
        JWT_TOKEN_LOCATION=["headers", "cookies"],
        JWT_REFRESH_COOKIE_NAME="refresh_token",
        JWT_ACCESS_COOKIE_NAME="access_token",
        JWT_COOKIE_CSRF_PROTECT=False,
        JWT_ACCESS_TOKEN_EXPIRES=timedelta(minutes=settings.ACCESS_TOKEN_EXPIRES),
        JWT_REFRESH_TOKEN_EXPIRES=timedelta(days=settings.REFRESH_TOKEN_EXPIRES),
    )
    return AuthX(config=config)


jwt_security = _make_jwt_security()


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _ph.verify(hashed_password, plain_password)
    except VerifyMismatchError:
        return False
