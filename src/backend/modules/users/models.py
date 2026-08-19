from datetime import datetime

from sqlalchemy import BigInteger, Boolean, DateTime, String, func, text
from sqlalchemy.orm import Mapped, mapped_column

from core.enums import UserRole
from database.base import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    role: Mapped[UserRole] = mapped_column()
    email: Mapped[str | None] = mapped_column(
        String(320), unique=True, index=True, nullable=True
    )
    name: Mapped[str] = mapped_column(String(100))
    password: Mapped[str | None] = mapped_column(String, nullable=True)
    is_active: Mapped[bool] = mapped_column(
        Boolean, default=True, server_default=text("true"), nullable=False
    )
    created_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), nullable=False
    )
