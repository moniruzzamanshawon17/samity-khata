class AppError(Exception):
    """Base class for every error the API returns on purpose."""

    status_code: int = 500
    default_detail: str = "Internal server error"
    headers: dict[str, str] | None = None

    def __init__(self, detail: str | None = None) -> None:
        self.detail = detail or self.default_detail
        super().__init__(self.detail)


class UnauthorizedError(AppError):
    """401: missing, invalid or expired credentials."""

    status_code = 401
    default_detail = "Invalid or expired token"
    headers = {"WWW-Authenticate": "Bearer"}


class ForbiddenError(AppError):
    """403: logged in, but not allowed to do this."""

    status_code = 403
    default_detail = "You do not have permission to perform this action"


class NotFoundError(AppError):
    """404: the requested record doesn't exist."""

    status_code = 404
    default_detail = "Not found"


class ConflictError(AppError):
    """409: clashes with existing data (duplicate, already reversed, has records)."""

    status_code = 409
    default_detail = "This change conflicts with existing data"


class UnprocessableError(AppError):
    """422: the input is well-formed but breaks a business rule."""

    status_code = 422
    default_detail = "The request could not be processed"


class ServiceUnavailableError(AppError):
    """503: a service we depend on (e.g. embeddings) is down."""

    status_code = 503
    default_detail = "A required service is unavailable"