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


def get_or_create_user_by_email(email: str, *, display_name: str | None = None) -> str:
    """Return Firebase uid for an email, creating the account if needed."""
    normalized = email.strip().lower()
    existing = lookup_user_id_by_email(normalized)
    if existing:
        return existing
    if not settings.firebase_project_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Firebase Auth is required for SSO sign-in",
        )
    _ensure_firebase_app()
    user = auth.create_user(email=normalized, display_name=display_name)
    return str(user.uid)


def create_custom_token(user_id: str, *, organization_id: str | None = None) -> str:
    claims: dict[str, str] = {}
    if organization_id:
        claims["organization_id"] = organization_id
    _ensure_firebase_app()
    return auth.create_custom_token(user_id, claims).decode("utf-8")


def lookup_user_id_by_email(email: str) -> str | None:
    """Resolve a Firebase Auth uid from an email address, if the account exists."""
    normalized = email.strip().lower()
    if not normalized:
        return None
    if not settings.firebase_project_id:
        return None
    try:
        _ensure_firebase_app()
        user = auth.get_user_by_email(normalized)
        return str(user.uid)
    except auth.UserNotFoundError:
        return None
    except HTTPException:
        return None
    except Exception:
        return None
