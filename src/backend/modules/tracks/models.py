import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class TrackSource(str, enum.Enum):
    YANDEX = "yandex"
    SPOTIFY = "spotify"


class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(255))
    artist: Mapped[str] = mapped_column(String(255))
    album: Mapped[str | None] = mapped_column(String(255), nullable=True)
    release_year: Mapped[int | None] = mapped_column(Integer, nullable=True)
    duration_ms: Mapped[int | None] = mapped_column(Integer, nullable=True)
    cover_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    source: Mapped[TrackSource] = mapped_column(Enum(TrackSource))
    source_id: Mapped[str] = mapped_column(String(128))
    yt_url: Mapped[str | None] = mapped_column(String(512), nullable=True)
    storage_key: Mapped[str | None] = mapped_column(String(512), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_tracks_source_source_id", "source", "source_id", unique=True),
    )

