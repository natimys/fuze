import base64
import binascii
from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from modules.tracks.schemas import TrackRead


MAX_ARTWORK_BYTES = 1024 * 1024
ALLOWED_ARTWORK_MIME_TYPES = {"image/jpeg", "image/png", "image/webp"}


def _validate_artwork(value: str | None) -> str | None:
    if value is None:
        return None
    try:
        header, encoded = value.split(",", 1)
    except ValueError as exc:
        raise ValueError("artwork must be an image data URL") from exc
    if not header.startswith("data:") or not header.endswith(";base64"):
        raise ValueError("artwork must be a base64 image data URL")
    mime_type = header[5:-7].lower()
    if mime_type not in ALLOWED_ARTWORK_MIME_TYPES:
        raise ValueError("unsupported artwork MIME type")
    try:
        decoded = base64.b64decode(encoded, validate=True)
    except (binascii.Error, ValueError) as exc:
        raise ValueError("artwork contains invalid base64 data") from exc
    if not decoded:
        raise ValueError("artwork must not be empty")
    if len(decoded) > MAX_ARTWORK_BYTES:
        raise ValueError("artwork exceeds the 1 MiB limit")
    return value


def _strip_required(value: str) -> str:
    value = value.strip()
    if not value:
        raise ValueError("must not be blank")
    return value


class PlaylistCreate(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)

    _normalize_title = field_validator("title")(_strip_required)

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None


class PlaylistUpdate(BaseModel):
    title: str | None = Field(default=None, min_length=1, max_length=100)
    description: str | None = Field(default=None, max_length=255)
    label_style: str | None = Field(default=None, pattern="^(aged|archival|stripe|blue|yellow|minimal|redline|typed|white|green)$")
    label_art: str | None = Field(default=None, max_length=1500000)
    cover_art: str | None = Field(default=None, max_length=1500000)

    _validate_label_art = field_validator("label_art")(_validate_artwork)
    _validate_cover_art = field_validator("cover_art")(_validate_artwork)

    @field_validator("title")
    @classmethod
    def normalize_title(cls, value: str | None) -> str | None:
        return _strip_required(value) if value is not None else None

    @field_validator("description")
    @classmethod
    def normalize_description(cls, value: str | None) -> str | None:
        if value is None:
            return None
        value = value.strip()
        return value or None

    @model_validator(mode="after")
    def require_update(self):
        if not self.model_fields_set:
            raise ValueError("at least one field must be provided")
        if "title" in self.model_fields_set and self.title is None:
            raise ValueError("title must not be null")
        return self


class PlaylistItemCreate(BaseModel):
    track_id: int = Field(gt=0)


class PlaylistReorder(BaseModel):
    item_ids: list[int]

    @field_validator("item_ids")
    @classmethod
    def validate_item_ids(cls, item_ids: list[int]) -> list[int]:
        if any(item_id <= 0 for item_id in item_ids):
            raise ValueError("item IDs must be positive")
        if len(set(item_ids)) != len(item_ids):
            raise ValueError("item IDs must be unique")
        return item_ids


class PlaylistSummary(BaseModel):
    id: int
    owner_id: int
    title: str
    description: str | None
    label_style: str
    label_art: str | None
    cover_art: str | None
    tracks_count: int
    created_at: datetime
    updated_at: datetime


class PlaylistItemRead(BaseModel):
    id: int
    position: int
    track: TrackRead
    model_config = {"from_attributes": True}


class PlaylistDetail(PlaylistSummary):
    items: list[PlaylistItemRead]


class ImportSource(BaseModel):
    id: str
    title: str
    tracks_count: int = 0


class ImportConnect(BaseModel):
    token: str = Field(min_length=10, max_length=4096)


class YandexDeviceAuthStart(BaseModel):
    device_code: str
    user_code: str
    verification_url: str
    expires_in: int
    interval: int


class YandexDeviceAuthPoll(BaseModel):
    device_code: str = Field(min_length=10, max_length=4096)


class YandexDeviceAuthResult(BaseModel):
    status: str = Field(pattern="^(pending|authorized)$")
    token: str | None = None


class ImportSelection(BaseModel):
    token: str = Field(min_length=10, max_length=4096)
    playlist_ids: list[str] = Field(min_length=1, max_length=100)


class ImportedTrack(BaseModel):
    source_id: str = Field(min_length=1, max_length=128)
    title: str = Field(min_length=1, max_length=255)
    artist: str = Field(min_length=1, max_length=255)
    album: str | None = Field(default=None, max_length=255)
    year: int | None = None
    duration_ms: int | None = Field(default=None, gt=0)
    cover_url: str | None = Field(default=None, max_length=512)


class FilePlaylistImport(BaseModel):
    title: str = Field(min_length=1, max_length=100)
    source: str = Field(pattern="^(spotify|yandex|youtube)$")
    tracks: list[ImportedTrack] = Field(min_length=1, max_length=10000)


class ImportResult(BaseModel):
    playlists_created: int
    tracks_added: int
