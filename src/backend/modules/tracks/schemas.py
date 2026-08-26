from typing import Literal
from datetime import datetime

from pydantic import BaseModel, Field, field_validator

from .models import TrackDownloadStatus


class TrackSearchResult(BaseModel):
    key: str
    track_id: int | None = None
    source: Literal["yandex", "youtube", "spotify"]
    capability: Literal["acquire", "external", "catalog"]
    availability: Literal["remote", "queued", "downloading", "ready", "failed"]
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
    status: Literal["ok", "disabled", "unavailable", "rate_limited", "quota_exceeded"]
    cached: bool = False


class TrackSearchResponse(BaseModel):
    data: list[TrackSearchResult]
    query: str
    providers: dict[str, ProviderState]
    spotify_search_url: str | None = None


class TrackAcquireRequest(BaseModel):
    source: Literal["yandex", "youtube", "spotify"]
    source_id: str = Field(min_length=1, max_length=128)

    @field_validator("source_id")
    @classmethod
    def strip_source_id(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("source_id must not be blank")
        return value


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
    download_status: TrackDownloadStatus
    download_attempts: int
    download_error_code: str | None = None
    download_error_message: str | None = None
    download_requested_at: datetime | None = None
    download_started_at: datetime | None = None
    download_finished_at: datetime | None = None
    model_config = {"from_attributes": True}


class TrackStreamResponse(BaseModel):
    url: str


class TrackDownloadDescriptor(BaseModel):
    track_id: int
    url: str
    content_type: str
    content_length: int = Field(gt=0)
    etag: str | None = None
    checksum: str | None = None
    expires_at: datetime
    media_version: str


class TrackDownloadBulkRequest(BaseModel):
    track_ids: list[int] = Field(min_length=1, max_length=500)


class TrackDownloadBulkResponse(BaseModel):
    data: list[TrackDownloadDescriptor]


class TrackAcquireResponse(BaseModel):
    status: TrackDownloadStatus
    track_id: int
