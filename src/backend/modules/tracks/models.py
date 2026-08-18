import enum
from datetime import datetime

from sqlalchemy import BigInteger, DateTime, Enum, Index, Integer, String, func
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base


class TrackSource(str, enum.Enum):
    YANDEX = "yandex"
    SPOTIFY = "spotify"
    YOUTUBE = "youtube"


class TrackDownloadStatus(str, enum.Enum):
    NOT_REQUESTED = "not_requested"
    QUEUED = "queued"
    DOWNLOADING = "downloading"
    READY = "ready"
    FAILED = "failed"


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
    download_status: Mapped[TrackDownloadStatus] = mapped_column(
        Enum(TrackDownloadStatus), default=TrackDownloadStatus.NOT_REQUESTED
    )
    download_attempts: Mapped[int] = mapped_column(Integer, default=0)
    download_error_code: Mapped[str | None] = mapped_column(String(64), nullable=True)
    download_error_message: Mapped[str | None] = mapped_column(
        String(512), nullable=True
    )
    download_task_id: Mapped[str | None] = mapped_column(String(64), nullable=True)
    download_requested_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    download_started_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    download_finished_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    download_lease_expires_at: Mapped[datetime | None] = mapped_column(
        DateTime, nullable=True
    )
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    __table_args__ = (
        Index("ix_tracks_source_source_id", "source", "source_id", unique=True),
    )
