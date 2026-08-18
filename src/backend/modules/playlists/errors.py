class PlaylistDomainError(Exception):
    status_code = 500
    message = "Playlist operation failed"

    def __init__(self, message: str | None = None):
        self.message = message or self.message
        super().__init__(self.message)


class PlaylistNotFound(PlaylistDomainError):
    status_code = 404
    message = "Playlist not found"


class PlaylistItemNotFound(PlaylistDomainError):
    status_code = 404
    message = "Playlist item not found"


class PlaylistTrackNotFound(PlaylistDomainError):
    status_code = 404
    message = "Track not found"


class PlaylistConflict(PlaylistDomainError):
    status_code = 409
    message = "Playlist was modified concurrently"


class InvalidPlaylistOrder(PlaylistDomainError):
    status_code = 422
    message = "Item order must contain every playlist item exactly once"
