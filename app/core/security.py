from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict

from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.integrations.firebase import verify_firebase_token


class Role(str, Enum):
    admin = "admin"
    viewer = "viewer"


@dataclass(frozen=True)
class Actor:
    user_id: str
    role: Role


_bearer = HTTPBearer(auto_error=False)


def _actor_from_firebase_claims(claims: Dict[str, Any]) -> Actor:
    # Default user id from Firebase subject or uid.
    user_id = str(claims.get("uid") or claims.get("sub") or "firebase-user")
    # Optional custom claim "role" to distinguish admin vs viewer.
    raw_role = str(claims.get("role", "viewer")).lower()
    role = Role.admin if raw_role == "admin" else Role.viewer
    return Actor(user_id=user_id, role=role)


def get_actor(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> Actor:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = creds.credentials

    # 1) Prototype local tokens (good for quick local testing).
    if token == settings.admin_token:
        return Actor(user_id="admin", role=Role.admin)
    if token == settings.viewer_token:
        return Actor(user_id="viewer", role=Role.viewer)

    # 2) If configured, try Firebase ID token verification.
    if settings.firebase_project_id:
        claims = verify_firebase_token(token)
        return _actor_from_firebase_claims(claims)

    # 3) Otherwise, reject unknown tokens.
    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def require_admin(actor: Actor = Depends(get_actor)) -> Actor:
    if actor.role != Role.admin:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return actor

