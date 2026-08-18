from datetime import datetime

from pydantic import BaseModel, Field, field_validator, model_validator

from modules.tracks.schemas import TrackRead


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
