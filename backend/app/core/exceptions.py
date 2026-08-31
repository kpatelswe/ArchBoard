class DomainError(Exception):
    """Base for errors raised by the service layer.

    Services stay free of HTTP concepts so the WebSocket layer can call them
    too; the api layer maps these onto status codes.
    """


class NotFound(DomainError):
    pass


class AccessDenied(DomainError):
    pass


class VersionConflict(DomainError):
    pass
