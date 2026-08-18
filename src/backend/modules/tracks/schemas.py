from typing import Literal

from pydantic import BaseModel


class TrackSearchResult(BaseModel):
    key: str
    track_id: int | None = None
    source: Literal["yandex", "youtube", "spotify"]
    action: Literal["playable", "external"]
    source_id: str
    title: str
    artist: str
    album: str | None = None
    year: int | None = None
    duration_ms: int | None = None
    cover_url: str | None = None
    external_url: str | None = None
    already_downloaded: bool = False


class ProviderState(BaseModel):
    status: Literal["ok", "unavailable", "rate_limited", "quota_exceeded"]
    cached: bool = False


class TrackSearchResponse(BaseModel):
    data: list[TrackSearchResult]
    query: str
    providers: dict[str, ProviderState]
    spotify_search_url: str


class TrackAcquireRequest(BaseModel):
    source: Literal["yandex", "youtube", "spotify"]
    source_id: str


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
