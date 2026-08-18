from sqlalchemy import BigInteger, String, ForeignKey
from sqlalchemy.orm import Mapped, mapped_column, relationship

from database.base import Base


class Playlist(Base):
    __tablename__ = "playlists"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    description: Mapped[str] = mapped_column(String(255))

    tracks: Mapped[list["PlaylistTrack"]] = relationship(back_populates="playlist")


class PlaylistTrack(Base):
    __tablename__ = "playlist_tracks"

    playlist_id: Mapped[int] = mapped_column(ForeignKey('playlists.id'), primary_key=True)
    track_id: Mapped[int] = mapped_column(ForeignKey('tracks.id'), primary_key=True)
    position: Mapped[int]

    playlist: Mapped["Playlist"] = relationship(back_populates="tracks")
