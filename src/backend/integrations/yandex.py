import asyncio
import json

from aiofiles import open
from yandex_music import ClientAsync

from core.settings import get_settings

settings = get_settings()


def on_code(code):
    print(f"Откройте {code.verification_url} и введите код: {code.user_code}")


async def main():
    client = ClientAsync(token=settings.YANDEX_ACCESS_TOKEN.get_secret_value())
    await client.init()
    print(f"{client.me.account.full_name}")
    tracks = await client.users_likes_tracks()
    track = await tracks[14].fetch_track_async()
    track_dict = track.to_dict()
    async with open('yt_track.json', 'w', encoding="utf-8") as file:
        await file.write(json.dumps(track_dict, ensure_ascii=False, indent=4))
    # await track.download_async(f"{track.title} - {track.artists}.mp3")


asyncio.run(main())
