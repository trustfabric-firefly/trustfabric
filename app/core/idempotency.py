from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any

from fastapi import HTTPException, Request, status
from fastapi.responses import JSONResponse

from app.core.config import settings
from app.domain.models import IdempotencyRecord, IdempotencyStatus
from app.services.store import store

IDEMPOTENCY_HEADER = "Idempotency-Key"
MAX_KEY_LENGTH = 256


def _validate_key(key: str | None) -> str | None:
    if not key:
        return None
    cleaned = key.strip()
    if not cleaned:
        return None
    if len(cleaned) > MAX_KEY_LENGTH:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Idempotency-Key must be at most {MAX_KEY_LENGTH} characters",
        )
    return cleaned


def idempotency_ttl_hours() -> int:
    return max(1, settings.idempotency_ttl_hours)


def begin_idempotent_request(
    organization_id: str,
    key: str | None,
    *,
    method: str,
    path: str,
) -> tuple[str | None, IdempotencyRecord | None]:
    """Return (key, existing_record). Raises HTTPException on in-flight duplicate."""
    normalized = _validate_key(key)
    if not normalized:
        return None, None

    existing = store.get_idempotency(organization_id, normalized)
    if existing:
        if existing.status == IdempotencyStatus.processing:
            raise HTTPException(
                status_code=status.HTTP_409_CONFLICT,
                detail="A request with this Idempotency-Key is already in progress",
            )
        return normalized, existing

    now = datetime.utcnow()
    record = IdempotencyRecord(
        key=normalized,
        organization_id=organization_id,
        method=method.upper(),
        path=path,
        status=IdempotencyStatus.processing,
        status_code=status.HTTP_202_ACCEPTED,
        response_body={},
        created_at=now,
        expires_at=now + timedelta(hours=idempotency_ttl_hours()),
    )
    store.save_idempotency(record)
    return normalized, None


def complete_idempotent_request(
    organization_id: str,
    key: str | None,
    *,
    status_code: int,
    response_body: dict[str, Any],
    resource_id: str | None = None,
) -> None:
    if not key:
        return
    store.complete_idempotency(
        organization_id,
        key,
        status_code=status_code,
        response_body=response_body,
        resource_id=resource_id,
    )


def cached_idempotency_response(record: IdempotencyRecord) -> JSONResponse:
    return JSONResponse(
        status_code=record.status_code,
        content=record.response_body,
    )


def get_idempotency_key(request: Request) -> str | None:
    return _validate_key(request.headers.get(IDEMPOTENCY_HEADER))
