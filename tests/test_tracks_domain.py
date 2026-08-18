from dataclasses import dataclass

import pytest

from modules.tracks.errors import InvalidTrackSource
from modules.tracks.models import TrackDownloadStatus, TrackSource
from modules.tracks.providers import (
    ProviderResult,
    SearchItem,
    search_cached,
    youtube_id,
)
from modules.tracks.service import TracksService, _validate_item


def test_youtube_id_accepts_only_canonical_length() -> None:
    assert youtube_id("dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert youtube_id("https://youtu.be/dQw4w9WgXcQ") == "dQw4w9WgXcQ"
    assert youtube_id("too-short") == ""


def test_track_metadata_rejects_overlong_audio() -> None:
    with pytest.raises(InvalidTrackSource, match="invalid_duration"):
        _validate_item(
            SearchItem(
                source_id="123",
                title="Long track",
                artist="Artist",
                duration_ms=30 * 60 * 1000 + 1,
            )
        )


@dataclass
class ExistingTrack:
    id: int
    download_status: TrackDownloadStatus


class SearchRepository:
    def __init__(self) -> None:
        self.keys = []

    async def find_by_sources(self, keys):
        self.keys = keys
        return {
            (TrackSource.YOUTUBE, "dQw4w9WgXcQ"): ExistingTrack(
                id=7, download_status=TrackDownloadStatus.READY
            )
        }


@pytest.mark.asyncio
async def test_search_uses_one_batch_lookup_and_marks_spotify_external(
    monkeypatch,
) -> None:
    async def fake_search(provider, query):
        items = {
            "youtube": [SearchItem("dQw4w9WgXcQ", "Video", "Uploader")],
            "spotify": [SearchItem("0" * 22, "Song", "Artist")],
            "yandex": [],
        }
        return ProviderResult(items[provider.source])

    monkeypatch.setattr("modules.tracks.service.search_cached", fake_search)
    repository = SearchRepository()
    result = await TracksService(repository).search("song")

    assert len(repository.keys) == 2
    spotify, youtube = result["data"]
    assert youtube["availability"] == "ready"
    assert youtube["capability"] == "acquire"
    assert spotify["capability"] == "external"
    assert spotify["availability"] == "remote"


@pytest.mark.asyncio
async def test_spotify_cannot_be_acquired() -> None:
    with pytest.raises(InvalidTrackSource, match="spotify_is_external_only"):
        await TracksService(SearchRepository()).acquire("spotify", "0" * 22)


@pytest.mark.asyncio
async def test_acquire_ready_track_skips_provider_lookup(monkeypatch) -> None:
    class ReadyRepository(SearchRepository):
        async def queue_existing(self, source, source_id, max_attempts=3):
            return ExistingTrack(9, TrackDownloadStatus.READY), False

    async def forbidden_get(source_id):
        raise AssertionError("provider lookup must not run for an existing track")

    monkeypatch.setattr(
        "modules.tracks.service.PROVIDERS",
        {"youtube": type("Provider", (), {"get": forbidden_get})()},
    )
    result = await TracksService(ReadyRepository()).acquire("youtube", "dQw4w9WgXcQ")
    assert result.track.id == 9
    assert not result.newly_queued


@pytest.mark.asyncio
async def test_provider_singleflight_uses_result_from_lock_owner(monkeypatch) -> None:
    calls = 0

    async def fake_cache_get(key):
        nonlocal calls
        calls += 1
        return (
            None
            if calls == 1
            else {"items": [{"source_id": "123", "title": "Song", "artist": "Artist"}]}
        )

    async def fake_lock(key, ttl_seconds):
        return None

    class Provider:
        source = "yandex"

        async def search(self, query):
            raise AssertionError("coalesced caller must not call provider")

    monkeypatch.setattr("modules.tracks.providers.cache_get", fake_cache_get)
    monkeypatch.setattr("modules.tracks.providers.cache_acquire_lock", fake_lock)
    result = await search_cached(Provider(), "song")
    assert result.cached
    assert result.items[0].title == "Song"
