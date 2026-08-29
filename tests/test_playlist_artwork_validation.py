import base64

import pytest
from pydantic import ValidationError

from modules.playlists.schemas import MAX_ARTWORK_BYTES, PlaylistUpdate


def data_url(mime_type: str, payload: bytes) -> str:
    return f"data:{mime_type};base64,{base64.b64encode(payload).decode()}"


@pytest.mark.parametrize("mime_type", ["image/jpeg", "image/png", "image/webp"])
def test_artwork_accepts_supported_image_data_urls(mime_type):
    value = data_url(mime_type, b"image")
    assert PlaylistUpdate(label_art=value).label_art == value


@pytest.mark.parametrize(
    "value",
    [
        "https://example.com/cover.png",
        "<html>not an image</html>",
        "data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=",
        "data:text/html;base64,PGgxPm5vPC9oMT4=",
        "data:image/png;base64,not-base64!",
    ],
)
def test_artwork_rejects_unsafe_or_invalid_payloads(value):
    with pytest.raises(ValidationError):
        PlaylistUpdate(cover_art=value)


def test_artwork_rejects_payload_over_limit_and_allows_clear():
    with pytest.raises(ValidationError, match="1 MiB"):
        PlaylistUpdate(label_art=data_url("image/png", b"x" * (MAX_ARTWORK_BYTES + 1)))
    assert PlaylistUpdate(label_art=None).label_art is None
