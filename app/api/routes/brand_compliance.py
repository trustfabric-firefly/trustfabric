# Brand compliance scanner API routes

from __future__ import annotations

from fastapi import APIRouter, Depends, File, Request, UploadFile, HTTPException, status

from app.core.rate_limit import rate_limit
from app.core.security import Actor, get_actor
from app.services.brand_compliance import scan_image_compliance, get_default_guidelines


router = APIRouter()

ALLOWED_MIME_TYPES = {"image/png", "image/jpeg", "image/webp", "image/gif"}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10 MB


@router.post("/scan")
async def scan_brand_compliance(
    request: Request,
    file: UploadFile = File(...),
    actor: Actor = Depends(get_actor),
):
    """Upload a marketing image and receive a brand compliance analysis."""
    rate_limit(request)

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Unsupported file type: {file.content_type}. Allowed: {', '.join(ALLOWED_MIME_TYPES)}",
        )

    image_bytes = await file.read()
    if len(image_bytes) > MAX_FILE_SIZE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"File too large ({len(image_bytes)} bytes). Maximum: {MAX_FILE_SIZE} bytes.",
        )

    result = scan_image_compliance(
        image_bytes=image_bytes,
        mime_type=file.content_type or "image/png",
        user_id=actor.user_id,
    )
    return result


@router.get("/guidelines")
async def get_guidelines(
    actor: Actor = Depends(get_actor),
):
    """Return the current brand guidelines used for compliance checks."""
    return get_default_guidelines()
