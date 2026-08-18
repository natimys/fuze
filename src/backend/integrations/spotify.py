import asyncio
import time
from dataclasses import dataclass
from datetime import datetime
from typing import Any

import httpx

from core.settings import get_settings


class SpotifyError(Exception):
    status = "unavailable"


class SpotifyRateLimited(SpotifyError):
    status = "rate_limited"


class SpotifyQuotaExceeded(SpotifyError):
    status = "quota_exceeded"


class SpotifyDisabled(SpotifyError):
    status = "disabled"


@dataclass
class SpotifyToken:
    value: str
    expires_at: float


class SpotifyClient:
    def __init__(self, client: httpx.AsyncClient | None = None):
        self._client: httpx.AsyncClient | None = client or httpx.AsyncClient()
        self._token: SpotifyToken | None = None
        self._token_lock = asyncio.Lock()
        self._retry_after_until = 0.0

    def _http(self) -> httpx.AsyncClient:
        if self._client is None:
            self._client = httpx.AsyncClient()
        return self._client

    async def _get_token(self, force: bool = False) -> str:
        now = time.monotonic()
        if not force and self._token and self._token.expires_at > now + 30:
            return self._token.value
        async with self._token_lock:
            now = time.monotonic()
            if not force and self._token and self._token.expires_at > now + 30:
                return self._token.value
            settings = get_settings()
            try:
                response = await self._http().post(
                    "https://accounts.spotify.com/api/token",
                    data={"grant_type": "client_credentials"},
                    auth=(
                        settings.SPOTIFY_CLIENT_ID or "",
                        settings.SPOTIFY_CLIENT_SECRET.get_secret_value()
                        if settings.SPOTIFY_CLIENT_SECRET
                        else "",
                    ),
                )
                response.raise_for_status()
                body = response.json()
                token = body["access_token"]
                expires_in = int(body.get("expires_in", 3600))
            except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
                raise SpotifyError("Unable to authenticate with Spotify") from exc
            self._token = SpotifyToken(token, now + expires_in)
            return token

    async def search(self, query: str, market: str) -> list[dict[str, Any]]:
        if time.monotonic() < self._retry_after_until:
            raise SpotifyRateLimited("Spotify retry window is active")
        token = await self._get_token()
        for attempt in range(2):
            try:
                response = await self._http().get(
                    "https://api.spotify.com/v1/search",
                    params={"q": query, "type": "track", "limit": 10, "market": market},
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as exc:
                raise SpotifyError("Spotify search failed") from exc
            if response.status_code == 401 and attempt == 0:
                token = await self._get_token(force=True)
                continue
            if response.status_code == 429:
                retry_after = max(int(response.headers.get("Retry-After", "1")), 1)
                self._retry_after_until = time.monotonic() + retry_after
                try:
                    reason = response.json().get("error", {}).get("reason")
                except ValueError:
                    reason = None
                if reason == "QUOTA_EXCEEDED":
                    raise SpotifyQuotaExceeded("Spotify quota exceeded")
                raise SpotifyRateLimited("Spotify rate limited")
            try:
                response.raise_for_status()
                items = response.json()["tracks"]["items"]
            except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
                raise SpotifyError("Malformed Spotify response") from exc
            return [self._map_track(item) for item in items[:10] if item.get("id")]
        raise SpotifyError("Spotify authorization failed")

    async def get_track(self, track_id: str, market: str) -> dict[str, Any]:
        if time.monotonic() < self._retry_after_until:
            raise SpotifyRateLimited("Spotify retry window is active")
        token = await self._get_token()
        for attempt in range(2):
            try:
                response = await self._http().get(
                    f"https://api.spotify.com/v1/tracks/{track_id}",
                    params={"market": market},
                    headers={"Authorization": f"Bearer {token}"},
                )
            except httpx.HTTPError as exc:
                raise SpotifyError("Spotify track lookup failed") from exc
            if response.status_code == 401 and attempt == 0:
                token = await self._get_token(force=True)
                continue
            if response.status_code == 429:
                retry_after = max(int(response.headers.get("Retry-After", "1")), 1)
                self._retry_after_until = time.monotonic() + retry_after
                raise SpotifyRateLimited("Spotify rate limited")
            try:
                response.raise_for_status()
                item = response.json()
                if not item.get("id"):
                    raise KeyError("id")
            except (httpx.HTTPError, KeyError, TypeError, ValueError) as exc:
                raise SpotifyError("Malformed Spotify track response") from exc
            return self._map_track(item)
        raise SpotifyError("Spotify authorization failed")

    async def close(self) -> None:
        if self._client is not None:
            await self._client.aclose()
            self._client = None

    @staticmethod
    def _map_track(item: dict[str, Any]) -> dict[str, Any]:
        album = item.get("album") or {}
        artists = item.get("artists") or []
        release_date = album.get("release_date")
        year = None
        if release_date:
            try:
                year = datetime.strptime(release_date[:4], "%Y").year
            except ValueError:
                pass
        images = album.get("images") or []
        return {
            "source_id": str(item["id"]),
            "title": item.get("name") or "Untitled",
            "artist": ", ".join(a.get("name", "") for a in artists if a.get("name"))
            or "Unknown",
            "album": album.get("name"),
            "year": year,
            "duration_ms": item.get("duration_ms"),
            "cover_url": images[0].get("url") if images else None,
            "external_url": (item.get("external_urls") or {}).get("spotify")
            or f"https://open.spotify.com/track/{item['id']}",
        }


spotify_client = SpotifyClient()
