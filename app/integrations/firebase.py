from __future__ import annotations

import os
from typing import Any

import firebase_admin
from firebase_admin import auth, credentials
from fastapi import HTTPException, status

from app.core.config import settings


def _ensure_firebase_app() -> None:
    try:
        firebase_admin.get_app()
        return
    except ValueError:
        pass

    creds_path = settings.firebase_credentials_file or os.getenv("SERVICE_FIREBASE")
    if not creds_path or not os.path.exists(creds_path):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Admin is not configured (missing SERVICE_FIREBASE credentials file).",
        )
    firebase_admin.initialize_app(credentials.Certificate(creds_path))


def verify_firebase_token(id_token: str) -> dict[str, Any]:
    """
    Verify a Firebase Auth ID token and return decoded claims.
    Requires the same service account / project as Firestore.
    """
    _ensure_firebase_app()
    try:
        decoded: dict[str, Any] = auth.verify_id_token(id_token, check_revoked=False)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or expired Firebase token",
        ) from exc

    if settings.firebase_project_id:
        aud = decoded.get("aud")
        if aud and aud != settings.firebase_project_id:
            raise HTTPException(
                status_code=status.HTTP_401_UNAUTHORIZED,
                detail="Firebase token project mismatch",
            )

    return decoded
