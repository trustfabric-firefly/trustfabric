from __future__ import annotations

from fastapi import FastAPI, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse
from starlette.exceptions import HTTPException as StarletteHTTPException


def _code_from_status(status_code: int) -> str:
    codes = {
        400: "bad_request",
        401: "unauthorized",
        403: "forbidden",
        404: "not_found",
        409: "conflict",
        422: "unprocessable_entity",
        429: "too_many_requests",
        500: "internal_server_error",
        502: "bad_gateway",
        503: "service_unavailable",
    }
    return codes.get(status_code, f"http_{status_code}")


def _error_response(status_code: int, message: str) -> JSONResponse:
    return JSONResponse(
        status_code=status_code,
        content={"error": {"code": _code_from_status(status_code), "message": message}},
    )


def register_error_handlers(app: FastAPI) -> None:
    @app.exception_handler(StarletteHTTPException)
    async def http_exception_handler(request: Request, exc: StarletteHTTPException) -> JSONResponse:
        detail = exc.detail
        if isinstance(detail, str):
            message = detail
        elif isinstance(detail, list):
            message = "; ".join(
                item.get("msg", str(item)) if isinstance(item, dict) else str(item)
                for item in detail
            )
        else:
            message = str(detail) if detail else "An error occurred"
        return _error_response(exc.status_code, message)

    @app.exception_handler(RequestValidationError)
    async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
        parts = []
        for error in exc.errors():
            loc = " -> ".join(str(p) for p in error.get("loc", []) if p != "body")
            msg = error.get("msg", "Invalid value")
            parts.append(f"{loc}: {msg}" if loc else msg)
        message = "; ".join(parts) if parts else "Validation error"
        return _error_response(status.HTTP_422_UNPROCESSABLE_ENTITY, message)
