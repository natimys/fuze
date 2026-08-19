from datetime import datetime, timedelta, timezone
from hashlib import sha256
from hmac import compare_digest
from uuid import UUID, uuid4

from authx import TokenPayload

from core.exceptions import CapabilityDisabled, InvalidAuthCredentials
from core.instance_config import get_fuze_config
from core.security import jwt_security, verify_password
from core.settings import get_settings

from modules.auth.repository import AuthSessionRepository
from modules.auth.schemas import KeyLogin, UserLogin, UserRegister
from modules.users.models import User
from modules.users.service import UserService
from modules.admin.service import ConfigService

_default_get_fuze_config = get_fuze_config


class AuthService:
    def __init__(
        self,
        user_service: UserService,
        session_repository: AuthSessionRepository,
        config_service: ConfigService | None = None,
    ):
        self.user_service = user_service
        self.session_repository = session_repository
        self.config_service = config_service

    async def _config(self):
        # Preserve explicit dependency substitution used by focused unit tests and
        # embedders while production instances always use ConfigService.
        if get_fuze_config is not _default_get_fuze_config:
            return get_fuze_config()
        if self.config_service is not None:
            return (await self.config_service.get_snapshot()).config
        return get_fuze_config()

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
        config = await self._config()
        if not config.auth.registration:
            raise CapabilityDisabled("registration_disabled")
        user = await self.user_service.register(
            email=data.email, name=data.name, password=data.password.get_secret_value()
        )
        return user

    async def authenticate(self, data: UserLogin) -> tuple[User, str, str]:
        if (await self._config()).auth.mode not in {"password", "both"}:
            raise CapabilityDisabled("password_login_disabled")
        user = await self.user_service.get_user_by_email(data.email)

        if not user or not user.is_active:
            raise InvalidAuthCredentials()

        password = data.password.get_secret_value()
        if user.password is None or not verify_password(
            plain_password=password, hashed_password=user.password
        ):
            raise InvalidAuthCredentials()

        access_token, refresh_token = await self._start_session(user.id)
        return user, access_token, refresh_token

    async def authenticate_key(self, data: KeyLogin) -> tuple[User, str, str]:
        if (await self._config()).auth.mode not in {"key", "both"}:
            raise CapabilityDisabled("key_login_disabled")
        key_hash = sha256(data.key.get_secret_value().encode("utf-8")).hexdigest()
        key = await self.session_repository.get_access_key_for_update(key_hash)
        if key is None or key.revoked_at is not None:
            await self.session_repository.rollback()
            raise InvalidAuthCredentials()
        user = await self.user_service.get_user_by_id(key.user_id)
        if user is None or not user.is_active:
            await self.session_repository.rollback()
            raise InvalidAuthCredentials()
        now = datetime.now(timezone.utc)
        await self.session_repository.mark_key_used(key, now)
        tokens = await self._start_session(user.id, access_key_id=key.id)
        return user, *tokens

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
                access_key_id=session.access_key_id,
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

    async def _start_session(
        self, user_id: int, access_key_id: UUID | None = None
    ) -> tuple[str, str]:
        session_id = uuid4()
        refresh_jti = str(uuid4())
        try:
            await self.session_repository.create(
                session_id=session_id,
                user_id=user_id,
                refresh_jti_hash=self._hash_jti(refresh_jti),
                expires_at=self._refresh_expiry(),
                access_key_id=access_key_id,
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
