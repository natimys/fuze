from sqlalchemy import BigInteger, String, Integer
from sqlalchemy.orm import Mapped, mapped_column

from database.base import Base

class Track(Base):
    __tablename__ = "tracks"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    title: Mapped[str] = mapped_column(String)
    yt_url: Mapped[str] = mapped_column(String)
    release_year: Mapped[int] = mapped_column(Integer)

