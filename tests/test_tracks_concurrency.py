import asyncio
import math
import time
from dataclasses import dataclass

import pytest

from core.rate_limit import acquire_rate_limit, search_rate_limit
from modules.tracks.providers import ProviderResult, SearchItem

CONCURRENCY = 20
ACQUIRE_P95_BUDGET_SECONDS = 2.0
SEARCH_P95_BUDGET_SECONDS = 1.5


def p95(samples: list[float]) -> float:
    rank = math.ceil(0.95 * len(samples)) - 1
    return sorted(samples)[rank]


@dataclass
class TimedResponse:
    status_code: int
    body: dict
    elapsed: float


async def timed_request(call) -> TimedResponse:
    started = time.perf_counter()
    response = await call
    return TimedResponse(
        status_code=response.status_code,
        body=response.json(),
        elapsed=time.perf_counter() - started,
    )


@pytest.mark.asyncio
async def test_twenty_acquires_enqueue_exactly_one_job_and_meet_p95(
    existing_user, monkeypatch
) -> None:
    from main import app
    from modules.tracks import service as tracks_service
    from worker import tasks as worker_tasks

    async def no_rate_limit() -> None:
        return None

    app.dependency_overrides[acquire_rate_limit] = no_rate_limit

    provider_calls = 0
    enqueue_calls: list[tuple[int, str | None]] = []

    class RacingProvider:
        async def get(self, source_id: str) -> SearchItem:
            nonlocal provider_calls
            provider_calls += 1
            await asyncio.sleep(0.05)
            return SearchItem(
                source_id=source_id,
                title="Concurrency gate",
                artist="Fuze",
                duration_ms=60_000,
                external_url=f"https://www.youtube.com/watch?v={source_id}",
            )

    def fake_enqueue(track_id: int, task_id: str | None = None) -> str:
        enqueue_calls.append((track_id, task_id))
        return task_id or "missing-task-id"

    monkeypatch.setitem(tracks_service.PROVIDERS, "youtube", RacingProvider())
    monkeypatch.setattr(worker_tasks, "enqueue_track_download", fake_enqueue)

    responses = await asyncio.gather(
        *(
            timed_request(
                existing_user.post(
                    "/api/v1/tracks/acquire",
                    json={"source": "youtube", "source_id": "dQw4w9WgXcQ"},
                )
            )
            for _ in range(CONCURRENCY)
        )
    )

    assert {response.status_code for response in responses} == {202}
    assert len({response.body["track_id"] for response in responses}) == 1
    assert len(enqueue_calls) == 1
    assert enqueue_calls[0][1]
    assert provider_calls > 1, "the test must exercise the insert race"
    acquire_p95 = p95([response.elapsed for response in responses])
    print(f"acquire p95 ({CONCURRENCY} concurrent requests): {acquire_p95:.3f}s")
    assert acquire_p95 < ACQUIRE_P95_BUDGET_SECONDS, acquire_p95


@pytest.mark.asyncio
async def test_twenty_searches_meet_p95(existing_user, monkeypatch) -> None:
    from main import app

    async def no_rate_limit() -> None:
        return None

    async def fake_search(provider, query: str) -> ProviderResult:
        source_ids = {
            "yandex": "12345",
            "youtube": "dQw4w9WgXcQ",
            "spotify": "0" * 22,
        }
        return ProviderResult(
            [
                SearchItem(
                    source_id=source_ids[provider.source],
                    title=f"{query} result",
                    artist="Fuze",
                    duration_ms=60_000,
                )
            ]
        )

    app.dependency_overrides[search_rate_limit] = no_rate_limit
    monkeypatch.setattr("modules.tracks.service.search_cached", fake_search)

    responses = await asyncio.gather(
        *(
            timed_request(existing_user.get("/api/v1/tracks/search", params={"q": "gate"}))
            for _ in range(CONCURRENCY)
        )
    )

    assert {response.status_code for response in responses} == {200}
    search_p95 = p95([response.elapsed for response in responses])
    print(f"search p95 ({CONCURRENCY} concurrent requests): {search_p95:.3f}s")
    assert search_p95 < SEARCH_P95_BUDGET_SECONDS, search_p95
