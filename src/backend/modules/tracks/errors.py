class TrackDomainError(Exception):
    status_code = 500
    code = "track_error"

    def __init__(self, message: str | None = None):
        self.message = message or self.code
        super().__init__(self.message)


class TrackNotFound(TrackDomainError):
    status_code = 404
    code = "track_not_found"


class TrackNotReady(TrackDomainError):
    status_code = 409
    code = "track_not_ready"


class TrackStateConflict(TrackDomainError):
    status_code = 409
    code = "track_state_conflict"


class InvalidTrackSource(TrackDomainError):
    status_code = 422
    code = "invalid_track_source"


class AmbiguousTrackMatch(TrackDomainError):
    status_code = 422
    code = "match_ambiguous"


class TrackDependencyUnavailable(TrackDomainError):
    status_code = 503
    code = "track_dependency_unavailable"


class TrackCapabilityDisabled(TrackDomainError):
    status_code = 403
    code = "capability_disabled"
