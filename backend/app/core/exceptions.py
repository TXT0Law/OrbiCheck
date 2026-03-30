from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse


class AppException(Exception):
    """Base application exception."""

    def __init__(self, code: str, message: str, status_code: int = 400):
        self.code = code
        self.message = message
        self.status_code = status_code


class ScanNotFoundError(AppException):
    def __init__(self, scan_id: str):
        super().__init__(
            code="SCAN_NOT_FOUND",
            message=f"Scan with id {scan_id} not found",
            status_code=404,
        )


class ScanNotCancellableError(AppException):
    """Raised when a scan cannot be cancelled (already completed/failed/cancelled)."""

    def __init__(self, scan_id: str, status: str):
        super().__init__(
            code="SCAN_NOT_CANCELLABLE",
            message=f"Scan is already {status}, cannot cancel",
            status_code=409,
        )


class ScanNotDeletableError(AppException):
    """Legacy: delete_scan no longer raises this (zombie RUNNING/PENDING rows are deletable)."""

    def __init__(self, scan_id: str, status: str):
        super().__init__(
            code="SCAN_NOT_DELETABLE",
            message="Cancel the scan before deleting",
            status_code=409,
        )


class ScanNotRescannableError(AppException):
    """Raised when a scan cannot be rescanned (still running or pending)."""

    def __init__(self, scan_id: str, status: str):
        super().__init__(
            code="SCAN_NOT_RESCANNABLE",
            message=(
                f"Scan is currently {status}. "
                "Only completed, failed, or cancelled scans can be rescanned."
            ),
            status_code=409,
        )


class ScanServiceError(AppException):
    def __init__(self, message: str):
        super().__init__(
            code="SCAN_SERVICE_ERROR",
            message=message,
            status_code=502,
        )


class ScanNotRetryableError(AppException):
    """Raised when module retry is not allowed (scan not in terminal state)."""

    def __init__(self, message: str):
        super().__init__(
            code="SCAN_NOT_RETRYABLE",
            message=message,
            status_code=409,
        )


class NotFoundError(AppException):
    """Resource not found (404)."""

    def __init__(self, code: str = "NOT_FOUND", message: str = "Resource not found"):
        super().__init__(code=code, message=message, status_code=404)


class ConflictError(AppException):
    """Conflict with existing resource (409)."""

    def __init__(self, code: str = "CONFLICT", message: str = "Resource conflict"):
        super().__init__(code=code, message=message, status_code=409)


class ValidationError(AppException):
    """Validation error (422)."""

    def __init__(self, code: str = "VALIDATION_ERROR", message: str = "Validation failed"):
        super().__init__(code=code, message=message, status_code=422)


class ChangeNotFoundException(AppException):
    """MonitorChange row missing or wrong monitor (404)."""

    def __init__(
        self,
        message: str = "Change not found",
        code: str = "CHANGE_NOT_FOUND",
    ):
        super().__init__(code=code, message=message, status_code=404)


class SnapshotNotFoundException(AppException):
    """Snapshot rows missing (e.g. purged by retention) (404)."""

    def __init__(
        self,
        message: str = "Snapshot content unavailable",
        code: str = "SNAPSHOT_NOT_FOUND",
    ):
        super().__init__(code=code, message=message, status_code=404)


class ContentTooLargeException(AppException):
    """Response body exceeds configured maximum (422)."""

    def __init__(self) -> None:
        super().__init__(
            code="CONTENT_TOO_LARGE",
            message="Response body exceeds maximum allowed size",
            status_code=422,
        )


class InvalidModuleNameError(AppException):
    def __init__(self, message: str):
        super().__init__(
            code="INVALID_MODULE_NAME",
            message=message,
            status_code=400,
        )


class ModuleAlreadySuccessfulError(AppException):
    def __init__(self, message: str):
        super().__init__(
            code="MODULE_ALREADY_SUCCESSFUL",
            message=message,
            status_code=409,
        )


class SslNotEnabledException(AppException):
    """Monitor does not have ssl_expiry capability enabled."""

    def __init__(self) -> None:
        super().__init__(
            code="SSL_NOT_ENABLED",
            message="SSL monitoring is not enabled for this monitor",
            status_code=400,
        )


class SslProbeFailedException(AppException):
    """Live or inline SSL probe failed irrecoverably (optional use)."""

    def __init__(self, detail: str = "") -> None:
        msg = f"SSL probe failed: {detail}" if detail else "SSL probe failed"
        super().__init__(
            code="SSL_PROBE_FAILED",
            message=msg,
            status_code=502,
        )


def register_exception_handlers(app: FastAPI) -> None:
    @app.exception_handler(AppException)
    async def app_exception_handler(
        request: Request,
        exc: AppException,
    ) -> JSONResponse:
        return JSONResponse(
            status_code=exc.status_code,
            content={
                "status": "error",
                "error": {"code": exc.code, "message": exc.message},
            },
        )
