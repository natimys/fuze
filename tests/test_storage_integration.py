from pathlib import Path

import pytest

from integrations import storage


class ClientContext:
    def __init__(self, client):
        self.client = client

    async def __aenter__(self):
        return self.client

    async def __aexit__(self, *args):
        return None


class FakeClient:
    def __init__(self):
        self.head_bucket_calls = 0
        self.upload_args = None
        self.objects = {"youtube/existing.opus": 4}

    async def head_bucket(self, **kwargs):
        self.head_bucket_calls += 1

    async def upload_file(self, path, bucket, key, ExtraArgs):
        self.upload_args = ExtraArgs
        self.objects[key] = Path(path).stat().st_size

    async def head_object(self, Bucket, Key):
        if Key not in self.objects:
            from botocore.exceptions import ClientError

            raise ClientError(
                {
                    "Error": {"Code": "NoSuchKey"},
                    "ResponseMetadata": {"HTTPStatusCode": 404},
                },
                "HeadObject",
            )
        return {"ContentLength": self.objects[Key]}

    async def generate_presigned_url(self, *args, **kwargs):
        return "http://browser/object"


class FakeSession:
    def __init__(self, client):
        self.fake_client = client

    def client(self, **kwargs):
        return ClientContext(self.fake_client)


@pytest.mark.asyncio
async def test_bucket_is_provisioned_once(monkeypatch) -> None:
    client = FakeClient()
    monkeypatch.setattr(storage, "_get_session", lambda: FakeSession(client))
    storage.reset_storage_state()
    monkeypatch.setattr(storage, "_get_session", lambda: FakeSession(client))
    await storage.ensure_bucket()
    await storage.ensure_bucket()
    assert client.head_bucket_calls == 1


@pytest.mark.asyncio
async def test_upload_records_checksum_size_and_content_type(
    monkeypatch, tmp_path
) -> None:
    client = FakeClient()
    monkeypatch.setattr(storage, "_get_session", lambda: FakeSession(client))
    source = tmp_path / "audio.opus"
    source.write_bytes(b"opus")
    await storage.upload_file(source, "youtube/new.opus", "audio/ogg")
    assert client.upload_args["ContentType"] == "audio/ogg"
    assert client.upload_args["Metadata"]["size"] == "4"
    assert len(client.upload_args["Metadata"]["sha256"]) == 64


@pytest.mark.asyncio
async def test_presigned_url_requires_existing_nonempty_object(monkeypatch) -> None:
    client = FakeClient()
    monkeypatch.setattr(storage, "_get_session", lambda: FakeSession(client))
    assert (
        await storage.get_presigned_url("youtube/existing.opus")
        == "http://browser/object"
    )
    with pytest.raises(FileNotFoundError):
        await storage.get_presigned_url("youtube/missing.opus")
