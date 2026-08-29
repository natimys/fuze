"""Live HTTPS/Range and least-privilege smoke test for the media stack."""

import asyncio
import os
import ssl
import urllib.request
from uuid import uuid4

import aioboto3
from botocore.config import Config
from botocore.exceptions import ClientError

PAYLOAD = b"fuze-range-check-0123456789"
RANGE_START = 5
RANGE_END = 15


def client_kwargs(endpoint_url: str) -> dict[str, object]:
    return {
        "service_name": "s3",
        "endpoint_url": endpoint_url,
        "aws_access_key_id": os.environ["MINIO_ACCESS_KEY"],
        "aws_secret_access_key": os.environ["MINIO_SECRET_KEY"],
        "region_name": "us-east-1",
        "config": Config(signature_version="s3v4"),
    }


async def assert_cannot_create_bucket(session: aioboto3.Session) -> None:
    forbidden_bucket = f"fuze-forbidden-{uuid4().hex}"
    try:
        async with session.client(
            **client_kwargs(os.environ["MINIO_ENDPOINT"])
        ) as client:
            await client.create_bucket(Bucket=forbidden_bucket)
    except ClientError as exc:
        status = exc.response.get("ResponseMetadata", {}).get("HTTPStatusCode")
        if status != 403:
            raise AssertionError(
                f"expected 403 for out-of-scope bucket creation, got {status}"
            ) from exc
    else:
        raise AssertionError("media account unexpectedly created another bucket")


async def run() -> None:
    bucket = os.environ["MINIO_BUCKET"]
    key = f"smoke/{uuid4().hex}.bin"
    session = aioboto3.Session()

    await assert_cannot_create_bucket(session)

    async with session.client(
        **client_kwargs(os.environ["MINIO_ENDPOINT"])
    ) as internal:
        await internal.put_object(
            Bucket=bucket,
            Key=key,
            Body=PAYLOAD,
            ContentType="application/octet-stream",
        )

    try:
        async with session.client(
            **client_kwargs(os.environ["MINIO_EXTERNAL_ENDPOINT"])
        ) as external:
            url = await external.generate_presigned_url(
                "get_object",
                Params={"Bucket": bucket, "Key": key},
                ExpiresIn=60,
            )

        request = urllib.request.Request(
            url,
            headers={"Range": f"bytes={RANGE_START}-{RANGE_END}"},
        )
        tls = ssl.create_default_context(cafile=os.environ["TLS_CA_FILE"])
        with urllib.request.urlopen(request, context=tls, timeout=10) as response:
            body = response.read()
            expected = PAYLOAD[RANGE_START : RANGE_END + 1]
            assert response.status == 206, response.status
            assert response.headers["Accept-Ranges"] == "bytes"
            assert response.headers["Content-Range"] == (
                f"bytes {RANGE_START}-{RANGE_END}/{len(PAYLOAD)}"
            )
            assert body == expected, (body, expected)
    finally:
        async with session.client(
            **client_kwargs(os.environ["MINIO_ENDPOINT"])
        ) as internal:
            await internal.delete_object(Bucket=bucket, Key=key)

    print("PASS: HTTPS presigned media request returned a valid 206 byte range")
    print("PASS: media account was denied permission to create another bucket")


if __name__ == "__main__":
    asyncio.run(run())
