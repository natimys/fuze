import os

from fastapi import APIRouter, Header, Depends
from fastapi.exceptions import HTTPException
from fastapi.responses import StreamingResponse

from core.settings import BACKEND_DIR
from .module import module
from .service import TracksService

router = APIRouter(prefix=module.router_prefix, tags=module.router_tags)


@router.get("/{audio_id}/stream")
async def audio(
        audio_id: str,
        range_header: str | None = Header(default=None, alias="Range"),
        tracks_service: TracksService = Depends(TracksService),
):
    try:
        path = f"{BACKEND_DIR}/integrations/downloads/{audio_id}.opus"
    except FileNotFoundError:
        raise HTTPException(status_code=404)
    size = os.path.getsize(path)

    start = 0
    end = size - 1
    status_code = 200

    if range_header:
        status_code = 206
        start_str, end_str = range_header.replace("bytes=", "").split("-")
        start = int(start_str)
        if end_str:
            end = int(end_str)

    headers = {
        "Accept-Ranges": "bytes",
        "Content-Length": str(end - start + 1),
        "Content-Type": "audio/mpeg",
    }

    if range_header:
        headers["Content-Range"] = f"bytes {start}-{end}/{size}"

    return StreamingResponse(
        tracks_service.iter_file(
            path=path,
            start=start,
            end=end,
        ),
        status_code=status_code,
        media_type="audio/mpeg",
        headers=headers,
    )


@router.post("/search/")
async def search(query: str, tracks_service: TracksService = Depends(TracksService)):
    result = await tracks_service.search(query)
    return result.url


@router.post("/download/")
async def download(url: str, tracks_service: TracksService = Depends(TracksService)):
    result = await tracks_service.download(url)
    return result.name
