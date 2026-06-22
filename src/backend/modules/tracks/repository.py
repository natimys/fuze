from sqlalchemy import select

from .models import Track, TrackSource


class TrackRepository:
    def __init__(self, db):
        self.db = db

    async def find_by_source(self, source: TrackSource, source_id: str) -> Track | None:
        query = select(Track).where(
            Track.source == source, Track.source_id == source_id
        )
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def find_by_id(self, track_id: int) -> Track | None:
        query = select(Track).where(Track.id == track_id)
        result = await self.db.execute(query)
        return result.scalar_one_or_none()

    async def search_in_db(self, query: str, limit: int = 20) -> list[Track]:
        q = f"%{query}%"
        stmt = (
            select(Track)
            .where(Track.title.ilike(q) | Track.artist.ilike(q))
            .limit(limit)
        )
        result = await self.db.execute(stmt)
        return list(result.scalars().all())

    async def create(self, **kwargs) -> Track:
        track = Track(**kwargs)
        self.db.add(track)
        await self.db.commit()
        await self.db.refresh(track)
        return track

    async def update(self, track: Track, **kwargs) -> Track:
        for key, value in kwargs.items():
            if value is not None:
                setattr(track, key, value)
        await self.db.commit()
        await self.db.refresh(track)
        return track
