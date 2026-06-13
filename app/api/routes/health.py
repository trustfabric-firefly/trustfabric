from __future__ import annotations

import os

from fastapi import APIRouter, status
from fastapi.responses import JSONResponse

from app.core.config import settings

router = APIRouter()


@router.get("/health", summary="Liveness check")
def health() -> dict[str, str]:
    return {"status": "ok", "service": settings.app_name, "version": settings.app_version}


@router.get("/health/ready", summary="Readiness check")
def readiness() -> JSONResponse:
    checks: dict[str, str] = {"api": "ok"}

    creds_path = settings.firebase_credentials_file or os.getenv("SERVICE_FIREBASE")
    if not creds_path or not os.path.exists(creds_path):
        checks["firestore"] = "missing_credentials"
    else:
        try:
            from app.services.store import store

            store.get_organization(settings.default_organization_id)
            checks["firestore"] = "ok"
        except Exception as exc:
            checks["firestore"] = f"error:{type(exc).__name__}"

    if settings.app_env == "production":
        if not settings.firebase_project_id:
            checks["auth"] = "firebase_project_missing"
        else:
            checks["auth"] = "ok"
        if not (settings.encryption_key or settings.oauth_state_secret):
            checks["encryption"] = "missing_key"
        else:
            checks["encryption"] = "ok"

    ready = all(value == "ok" for value in checks.values())
    body = {"status": "ready" if ready else "degraded", "checks": checks}
    return JSONResponse(
        status_code=status.HTTP_200_OK if ready else status.HTTP_503_SERVICE_UNAVAILABLE,
        content=body,
    )
