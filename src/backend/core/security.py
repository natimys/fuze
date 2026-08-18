from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from authx import AuthX, AuthXConfig

_ph = PasswordHasher()


def _make_jwt_security() -> AuthX:
    from core.settings import get_settings

    settings = get_settings()
    config = AuthXConfig(
        JWT_SECRET_KEY=settings.JWT_SECURITY_KEY.get_secret_value(),
        JWT_TOKEN_LOCATION=["cookies"],
        JWT_REFRESH_COOKIE_NAME="refresh_token",
        JWT_ACCESS_COOKIE_NAME="access_token",
        JWT_ACCESS_COOKIE_PATH="/",
        JWT_REFRESH_COOKIE_PATH="/api/v1/auth/refresh",
        JWT_ACCESS_CSRF_COOKIE_PATH="/",
        # The refresh JWT remains narrowly scoped, while browser JavaScript must
        # be able to read its double-submit CSRF cookie from application pages.
        JWT_REFRESH_CSRF_COOKIE_PATH="/",
        JWT_COOKIE_CSRF_PROTECT=True,
        JWT_CSRF_IN_COOKIES=True,
        JWT_ACCESS_CSRF_HEADER_NAME="X-CSRF-TOKEN",
        JWT_REFRESH_CSRF_HEADER_NAME="X-CSRF-TOKEN",
        JWT_COOKIE_HTTP_ONLY=True,
        JWT_COOKIE_SAMESITE=settings.COOKIE_SAMESITE,
        JWT_COOKIE_SECURE=settings.COOKIE_SECURE,
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
    except VerificationError:
        return False
