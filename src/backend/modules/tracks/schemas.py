from pydantic import BaseModel


class TrackSearchResult(BaseModel):
    id: int
    title: str
    artist: str
    album: str | None = None
    year: int | None = None
    duration_ms: int | None = None
    cover_url: str | None = None
    source_id: str
    already_downloaded: bool = False


class TrackSearchResponse(BaseModel):
    data: list[TrackSearchResult]
    query: str


class TrackRead(BaseModel):
    id: int
    title: str
    artist: str
    album: str | None = None
    release_year: int | None = None
    duration_ms: int | None = None
    cover_url: str | None = None
    source: str
    source_id: str

    model_config = {"from_attributes": True}


class TrackStreamResponse(BaseModel):
    url: str


class TrackDownloadResponse(BaseModel):
    status: str
    track_id: int
