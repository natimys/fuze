class AppException(Exception):
    status_code: int = 500
    detail: str = "Internal server error"


class UserAlreadyExists(AppException):
    status_code = 409
    detail = "User already exists"


class InvalidAuthCredentials(AppException):
    status_code = 401
    detail = "Invalid credentials"


class CapabilityDisabled(AppException):
    status_code = 403

    def __init__(self, code: str):
        self.detail = code
