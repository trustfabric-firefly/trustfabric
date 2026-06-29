from __future__ import annotations

from dataclasses import dataclass
from enum import Enum
from typing import Any, Dict

from fastapi import Depends, Header, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer

from app.core.config import settings
from app.domain.models import OrgRole
from app.integrations.firebase import verify_firebase_token
from app.services.organizations import ensure_dev_actor_membership, resolve_organization_for_actor


class Role(str, Enum):
    admin = "admin"
    viewer = "viewer"


_WRITE_ORG_ROLES = {OrgRole.owner, OrgRole.admin, OrgRole.security_admin}
_OPERATOR_ORG_ROLES = _WRITE_ORG_ROLES


@dataclass(frozen=True)
class Actor:
    user_id: str
    organization_id: str
    role: Role
    org_role: OrgRole
    email: str | None = None

    @property
    def can_write(self) -> bool:
        return self.role == Role.admin or self.org_role in _WRITE_ORG_ROLES


_bearer = HTTPBearer(auto_error=False)


def _map_org_role_to_api_role(org_role: OrgRole) -> Role:
    if org_role in (OrgRole.owner, OrgRole.admin, OrgRole.security_admin):
        return Role.admin
    return Role.viewer


def _actor_from_firebase_claims(claims: Dict[str, Any], requested_org_id: str | None) -> Actor:
    user_id = str(claims.get("uid") or claims.get("sub") or "firebase-user")
    raw_email = claims.get("email")
    email = str(raw_email) if raw_email is not None else None
    claim_org_id = claims.get("organization_id")
    if claim_org_id is not None:
        claim_org_id = str(claim_org_id)

    org_id, org_role = resolve_organization_for_actor(
        user_id,
        email=email,
        requested_org_id=requested_org_id,
        claim_org_id=claim_org_id,
    )
    api_role = _map_org_role_to_api_role(org_role)
    if str(claims.get("role", "")).lower() == "admin":
        api_role = Role.admin
    elif str(claims.get("role", "")).lower() == "viewer":
        api_role = Role.viewer

    return Actor(
        user_id=user_id,
        organization_id=org_id,
        role=api_role,
        org_role=org_role,
        email=email,
    )


def get_actor(
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
    x_organization_id: str | None = Header(default=None, alias="X-Organization-Id"),
) -> Actor:
    if creds is None or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing bearer token")

    token = creds.credentials
    is_production = settings.app_env == "production"

    if not is_production:
        if settings.admin_token and token == settings.admin_token:
            org_id = ensure_dev_actor_membership("admin", OrgRole.owner)
            return Actor(
                user_id="admin",
                organization_id=org_id,
                role=Role.admin,
                org_role=OrgRole.owner,
            )
        if settings.viewer_token and token == settings.viewer_token:
            org_id = ensure_dev_actor_membership("viewer", OrgRole.viewer)
            return Actor(
                user_id="viewer",
                organization_id=org_id,
                role=Role.viewer,
                org_role=OrgRole.viewer,
            )

    if settings.firebase_project_id:
        claims = verify_firebase_token(token)
        return _actor_from_firebase_claims(claims, x_organization_id)

    if is_production:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Firebase authentication is required in production",
        )

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")


def require_admin(actor: Actor = Depends(get_actor)) -> Actor:
    if not actor.can_write:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Admin role required")
    return actor


def require_operator(actor: Actor = Depends(get_actor)) -> Actor:
    """Require owner, admin, or security_admin for scans and copilot LLM operations."""
    if actor.org_role not in _OPERATOR_ORG_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin or security admin role required",
        )
    return actor
