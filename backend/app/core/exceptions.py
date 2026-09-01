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


class InsufficientRole(DomainError):
    """Member of the board, but their role does not permit this action.

    Distinct from AccessDenied (non-member): a member already knows the board
    exists, so the api layer may answer 403 instead of the hiding 404.
    """

