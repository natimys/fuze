from datetime import timedelta
from pathlib import Path

import aioboto3

from core.settings import get_settings

_session: aioboto3.Session | None = None


def _get_session() -> aioboto3.Session:
    global _session
    if _session is None:
        _session = aioboto3.Session()
    return _session


def _build_client_kwargs(external: bool = False) -> dict:
    s = get_settings()
    endpoint = s.MINIO_EXTERNAL_ENDPOINT if external else s.MINIO_ENDPOINT
    return {
        "service_name": "s3",
        "endpoint_url": f"http://{endpoint}" if not s.MINIO_SECURE else f"https://{endpoint}",
        "aws_access_key_id": s.MINIO_ACCESS_KEY,
        "aws_secret_access_key": s.MINIO_SECRET_KEY,
        "region_name": "us-east-1",
    }


async def ensure_bucket() -> None:
    s = get_settings()
    async with _get_session().client(**_build_client_kwargs()) as client:
        buckets = await client.list_buckets()
        exists = any(b["Name"] == s.MINIO_BUCKET for b in buckets["Buckets"])
        if not exists:
            await client.create_bucket(Bucket=s.MINIO_BUCKET)


async def upload_file(local_path: Path, object_name: str) -> str:
    await ensure_bucket()
    async with _get_session().client(**_build_client_kwargs()) as client:
        await client.upload_file(
            str(local_path),
            get_settings().MINIO_BUCKET,
            object_name,
        )
    return object_name


async def get_presigned_url(object_name: str, expires_days: int = 1) -> str:
    async with _get_session().client(**_build_client_kwargs(external=True)) as client:
        url = await client.generate_presigned_url(
            "get_object",
            Params={
                "Bucket": get_settings().MINIO_BUCKET,
                "Key": object_name,
            },
            ExpiresIn=int(timedelta(days=expires_days).total_seconds()),
        )
    return url
