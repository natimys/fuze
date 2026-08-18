from pydantic import BaseModel, Field


class PlaylistCreate(BaseModel):
    title: str = Field(min_length=3,max_length=100)
    description: str = Field(min_length=3,max_length=255)

class PlaylistUpdate(BaseModel):
    title: str = Field(min_length=3,max_length=100)
    description: str = Field(min_length=3,max_length=255)

class PlaylistInfo(BaseModel):
    title: str
    description: str
    tracks_count: int
