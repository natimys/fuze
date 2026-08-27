from types import SimpleNamespace

import pytest

from modules.tracks.errors import TrackCapabilityDisabled
from modules.tracks.models import TrackDownloadStatus, TrackSource
from modules.tracks.providers import ProviderResult, SearchItem
from modules.tracks.service import TrackDownloadProcessor, TracksService


def config(*, playback, youtube=True, yandex=False, spotify=False):
    return SimpleNamespace(
        features=SimpleNamespace(playback=playback),
        providers=SimpleNamespace(
            youtube=youtube, yandex=yandex, spotify=spotify, spotify_market="US"
        ),
    )


class Repository:
    async def find_by_sources(self, keys):
        return {}


async def test_catalog_search_skips_disabled_providers(monkeypatch):
    calls = []

    async def search(provider, query):
        calls.append(provider.source)
        return ProviderResult([SearchItem("abcdefghijk", "Title", "Artist")])

    monkeypatch.setattr(
        "modules.tracks.service.get_fuze_config", lambda: config(playback=False)
    )
    monkeypatch.setattr("modules.tracks.service.search_cached", search)
    result = await TracksService(Repository(), enforce_config=True).search("title")
    assert calls == ["youtube"]
    assert result["providers"]["yandex"]["status"] == "disabled"
    assert result["providers"]["spotify"]["status"] == "disabled"
    assert result["data"][0]["capability"] == "catalog"
    assert result["spotify_search_url"] is None


async def test_playback_disabled_blocks_acquire_and_stream(monkeypatch):
    monkeypatch.setattr(
        "modules.tracks.service.get_fuze_config", lambda: config(playback=False)
    )
    service = TracksService(Repository(), enforce_config=True)
    with pytest.raises(TrackCapabilityDisabled, match="playback_disabled"):
        await service.acquire("youtube", "abcdefghijk")
    with pytest.raises(TrackCapabilityDisabled, match="playback_disabled"):
        await service.get_stream_url(1)


async def test_worker_fails_queued_item_when_playback_is_disabled(monkeypatch):
    class WorkerRepository:
        failed = None

        async def mark_queued_failed(self, track_id, code, message):
            self.failed = (track_id, code, message)

    repository = WorkerRepository()
    monkeypatch.setattr(
        "modules.tracks.service.get_fuze_config", lambda: config(playback=False)
    )
    assert await TrackDownloadProcessor(repository).process(9, "task") is False
    assert repository.failed[:2] == (9, "playback_disabled")


async def test_saved_track_from_disabled_provider_can_still_stream(monkeypatch):
    track = SimpleNamespace(
        id=4,
        source=TrackSource.YANDEX,
        download_status=TrackDownloadStatus.READY,
        storage_key="yandex/4.opus",
    )

    class SavedRepository:
        async def find_by_id(self, track_id):
            return track

    monkeypatch.setattr(
        "modules.tracks.service.get_fuze_config", lambda: config(playback=True)
    )

    async def url(key):
        return f"https://media/{key}"

    monkeypatch.setattr("modules.tracks.service.get_presigned_url", url)
    value = await TracksService(
        SavedRepository(), enforce_config=True
    ).get_stream_url(4)
    assert value.endswith("yandex/4.opus")
