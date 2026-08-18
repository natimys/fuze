from datetime import datetime, timedelta, timezone
from hashlib import sha256
from hmac import compare_digest
from uuid import UUID, uuid4

from authx import TokenPayload

from core.exceptions import InvalidAuthCredentials
from core.security import jwt_security, verify_password
from core.settings import get_settings

from modules.auth.repository import AuthSessionRepository
from modules.auth.schemas import UserLogin, UserRegister
from modules.users.models import User
from modules.users.service import UserService


class AuthService:
    def __init__(
        self,
        user_service: UserService,
        session_repository: AuthSessionRepository,
    ):
        self.user_service = user_service
        self.session_repository = session_repository

    def generate_tokens(
        self,
        *,
        user_id: int,
        session_id: UUID,
        refresh_jti: str,
    ) -> tuple[str, str]:
        token_data = {"sid": str(session_id)}
        access_token = jwt_security.create_access_token(
            uid=str(user_id), data=token_data
        )
        refresh_token = jwt_security.create_refresh_token(
            uid=str(user_id), data={**token_data, "jti": refresh_jti}
        )
        return access_token, refresh_token

    async def register(self, data: UserRegister) -> User:
        user = await self.user_service.register(
            email=data.email, name=data.name, password=data.password.get_secret_value()
        )
        return user

    async def authenticate(self, data: UserLogin) -> tuple[User, str, str]:
        user = await self.user_service.get_user_by_email(data.email)

        if not user or not user.is_active:
            raise InvalidAuthCredentials()

        password = data.password.get_secret_value()
        if not verify_password(plain_password=password, hashed_password=user.password):
            raise InvalidAuthCredentials()

        access_token, refresh_token = await self._start_session(user.id)
        return user, access_token, refresh_token

    async def rotate(self, payload: TokenPayload) -> tuple[str, str]:
        user_id, session_id, refresh_jti = self._parse_payload(payload)
        user = await self.user_service.get_user_by_id(user_id)
        if user is None or not user.is_active:
            raise InvalidAuthCredentials()

        session = await self.session_repository.get_for_update(session_id)
        now = datetime.now(timezone.utc)
        if (
            session is None
            or session.user_id != user_id
            or session.revoked_at is not None
            or session.expires_at <= now
            or not compare_digest(session.refresh_jti_hash, self._hash_jti(refresh_jti))
        ):
            await self.session_repository.rollback()
            raise InvalidAuthCredentials()

        new_session_id = uuid4()
        new_refresh_jti = str(uuid4())
        expires_at = self._refresh_expiry()
        try:
            await self.session_repository.create(
                session_id=new_session_id,
                user_id=user_id,
                refresh_jti_hash=self._hash_jti(new_refresh_jti),
                expires_at=expires_at,
            )
            session.revoked_at = now
            session.replaced_by = new_session_id
            await self.session_repository.commit()
        except Exception:
            await self.session_repository.rollback()
            raise

        return self.generate_tokens(
            user_id=user_id,
            session_id=new_session_id,
            refresh_jti=new_refresh_jti,
        )

    async def revoke(self, payload: TokenPayload) -> None:
        try:
            user_id = int(payload.sub)
            session_id = UUID(str(getattr(payload, "sid")))
        except (TypeError, ValueError, AttributeError, OverflowError):
            raise InvalidAuthCredentials() from None

        session = await self.session_repository.get_for_update(session_id)
        if (
            session is not None
            and session.user_id == user_id
            and session.revoked_at is None
        ):
            session.revoked_at = datetime.now(timezone.utc)
            await self.session_repository.commit()
        else:
            await self.session_repository.rollback()

    async def _start_session(self, user_id: int) -> tuple[str, str]:
        session_id = uuid4()
        refresh_jti = str(uuid4())
        try:
            await self.session_repository.create(
                session_id=session_id,
                user_id=user_id,
                refresh_jti_hash=self._hash_jti(refresh_jti),
                expires_at=self._refresh_expiry(),
            )
            await self.session_repository.commit()
        except Exception:
            await self.session_repository.rollback()
            raise
        return self.generate_tokens(
            user_id=user_id,
            session_id=session_id,
            refresh_jti=refresh_jti,
        )

    @staticmethod
    def _parse_payload(payload: TokenPayload) -> tuple[int, UUID, str]:
        try:
            user_id = int(payload.sub)
            session_id = UUID(str(getattr(payload, "sid")))
            refresh_jti = str(payload.jti)
        except (TypeError, ValueError, AttributeError, OverflowError):
            raise InvalidAuthCredentials() from None
        if not refresh_jti:
            raise InvalidAuthCredentials()
        return user_id, session_id, refresh_jti

    @staticmethod
    def _hash_jti(jti: str) -> str:
        return sha256(jti.encode("utf-8")).hexdigest()

    @staticmethod
    def _refresh_expiry() -> datetime:
        return datetime.now(timezone.utc) + timedelta(
            days=get_settings().REFRESH_TOKEN_EXPIRES
        )
