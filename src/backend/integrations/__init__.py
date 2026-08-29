async def close_integrations() -> None:
    """Close process-scoped clients; call from the application lifespan."""
    from .cache import close_redis
    from .spotify import spotify_client
    from .storage import reset_storage_state

    await close_redis()
    await spotify_client.close()
    reset_storage_state()
