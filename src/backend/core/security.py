from datetime import timedelta

from argon2 import PasswordHasher
from argon2.exceptions import VerificationError
from authx import AuthX, AuthXConfig, TokenPayload
from authx.exceptions import AuthXException
from authx.schema import RequestToken
from fastapi import Request, Response

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


def unset_legacy_refresh_cookie(response: Response) -> None:
    """Remove refresh cookies issued before their path was narrowed."""
    response.delete_cookie(
        key=jwt_security.config.JWT_REFRESH_COOKIE_NAME,
        path="/",
        domain=jwt_security.config.JWT_COOKIE_DOMAIN,
    )


async def refresh_token_required(request: Request) -> TokenPayload:
    """Validate the first usable refresh JWT when legacy paths cause duplicates."""
    config = jwt_security.config
    candidates = [
        value
        for header in request.headers.getlist("cookie")
        for chunk in header.split(";")
        for key, separator, value in [chunk.strip().partition("=")]
        if separator and key == config.JWT_REFRESH_COOKIE_NAME and value
    ]
    if len(candidates) <= 1:
        return await jwt_security.refresh_token_required(request)

    csrf_token = request.headers.get(config.JWT_REFRESH_CSRF_HEADER_NAME)
    last_error: AuthXException | None = None
    for candidate in candidates:
        try:
            if await jwt_security.is_token_in_blocklist(candidate):
                continue
            return jwt_security.verify_token(
                RequestToken(
                    token=candidate,
                    csrf=csrf_token,
                    type="refresh",
                    location="cookies",
                ),
                verify_type=True,
                verify_fresh=False,
                verify_csrf=True,
            )
        except AuthXException as exc:
            last_error = exc

    if last_error is not None:
        raise last_error
    return await jwt_security.refresh_token_required(request)


def hash_password(password: str) -> str:
    return _ph.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    try:
        return _ph.verify(hashed_password, plain_password)
    except VerificationError:
        return False
