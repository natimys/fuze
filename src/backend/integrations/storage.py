import asyncio
import hashlib
from dataclasses import dataclass
from pathlib import Path

import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

from core.settings import get_settings

_session: aioboto3.Session | None = None
_bucket_ready = False
_bucket_lock = asyncio.Lock()


@dataclass(frozen=True)
class ObjectMetadata:
    content_type: str
    content_length: int
    etag: str | None
    checksum: str | None


def _get_session() -> aioboto3.Session:
    global _session
    if _session is None:
        _session = aioboto3.Session()
    return _session


def _build_client_kwargs(external: bool = False) -> dict:
    settings = get_settings()
    endpoint = settings.MINIO_EXTERNAL_ENDPOINT if external else settings.MINIO_ENDPOINT
    secure = (
        settings.MINIO_EXTERNAL_SECURE
        if external and settings.MINIO_EXTERNAL_SECURE is not None
        else settings.MINIO_SECURE
    )
    endpoint_url = (
        endpoint
        if endpoint.startswith(("http://", "https://"))
        else f"{'https' if secure else 'http'}://{endpoint}"
    )
    return {
        "service_name": "s3",
        "endpoint_url": endpoint_url,
        "aws_access_key_id": settings.MINIO_ACCESS_KEY,
        "aws_secret_access_key": settings.MINIO_SECRET_KEY,
        "region_name": "us-east-1",
        "config": Config(
            connect_timeout=3,
            read_timeout=10,
            retries={"max_attempts": 2, "mode": "standard"},
        ),
    }


def _is_missing(exc: ClientError) -> bool:
    code = str(exc.response.get("Error", {}).get("Code", ""))
    status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
    return code in {"404", "NoSuchBucket", "NoSuchKey", "NotFound"} or status == 404


async def storage_ready() -> bool:
    """Readiness probe without bucket enumeration or mutation."""
    settings = get_settings()
    try:
        async with _get_session().client(**_build_client_kwargs()) as client:
            await client.head_bucket(Bucket=settings.MINIO_BUCKET)
        return True
    except Exception:
        return False


async def ensure_bucket() -> None:
    """Provision once per process; normal uploads never enumerate buckets."""
    global _bucket_ready
    if _bucket_ready:
        return
    async with _bucket_lock:
        if _bucket_ready:
            return
        settings = get_settings()
        async with _get_session().client(**_build_client_kwargs()) as client:
            try:
                await client.head_bucket(Bucket=settings.MINIO_BUCKET)
            except ClientError as exc:
                if not _is_missing(exc):
                    raise
                await client.create_bucket(Bucket=settings.MINIO_BUCKET)
        _bucket_ready = True


async def upload_file(
    local_path: Path, object_name: str, content_type: str = "application/octet-stream"
) -> str:
    if not local_path.is_file() or local_path.stat().st_size <= 0:
        raise ValueError("Cannot upload a missing or empty file")
    size = local_path.stat().st_size
    digest = hashlib.sha256()
    with local_path.open("rb") as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b""):
            digest.update(chunk)
    settings = get_settings()
    async with _get_session().client(**_build_client_kwargs()) as client:
        await client.upload_file(
            str(local_path),
            settings.MINIO_BUCKET,
            object_name,
            ExtraArgs={
                "ContentType": content_type,
                "Metadata": {"sha256": digest.hexdigest(), "size": str(size)},
            },
        )
        head = await client.head_object(Bucket=settings.MINIO_BUCKET, Key=object_name)
        if int(head.get("ContentLength", -1)) != size:
            raise RuntimeError("Uploaded object size does not match the source file")
    return object_name


async def object_exists(object_name: str) -> bool:
    settings = get_settings()
    try:
        async with _get_session().client(**_build_client_kwargs()) as client:
            result = await client.head_object(
                Bucket=settings.MINIO_BUCKET, Key=object_name
            )
        return int(result.get("ContentLength", 0)) > 0
    except ClientError as exc:
        if _is_missing(exc):
            return False
        raise


async def get_object_metadata(object_name: str) -> ObjectMetadata:
    settings = get_settings()
    async with _get_session().client(**_build_client_kwargs()) as client:
        result = await client.head_object(Bucket=settings.MINIO_BUCKET, Key=object_name)
    metadata = result.get("Metadata", {})
    return ObjectMetadata(
        content_type=str(result.get("ContentType") or "application/octet-stream"),
        content_length=int(result.get("ContentLength", 0)),
        etag=str(result["ETag"]).strip('"') if result.get("ETag") else None,
        checksum=metadata.get("sha256"),
    )


async def list_object_keys() -> set[str]:
    settings = get_settings()
    keys: set[str] = set()
    async with _get_session().client(**_build_client_kwargs()) as client:
        paginator = client.get_paginator("list_objects_v2")
        async for page in paginator.paginate(Bucket=settings.MINIO_BUCKET):
            keys.update(item["Key"] for item in page.get("Contents", []))
    return keys


async def delete_object(object_name: str) -> None:
    settings = get_settings()
    async with _get_session().client(**_build_client_kwargs()) as client:
        await client.delete_object(Bucket=settings.MINIO_BUCKET, Key=object_name)


async def get_presigned_url(
    object_name: str, expires_seconds: int | None = None
) -> str:
    settings = get_settings()
    if not await object_exists(object_name):
        raise FileNotFoundError(object_name)
    ttl = expires_seconds or settings.MINIO_PRESIGNED_TTL_SECONDS
    async with _get_session().client(**_build_client_kwargs(external=True)) as client:
        return await client.generate_presigned_url(
            "get_object",
            Params={"Bucket": settings.MINIO_BUCKET, "Key": object_name},
            ExpiresIn=ttl,
        )


def reset_storage_state() -> None:
    """Reset process-local readiness state for lifespan shutdown and tests."""
    global _session, _bucket_ready
    _session = None
    _bucket_ready = False
