from __future__ import annotations

import re
import uuid
from datetime import datetime
from typing import Any, Optional

from fastapi import HTTPException, status

from app.core.config import settings
from app.domain.models import Organization, OrganizationCreate, OrganizationMember, OrgRole
from app.services.store import store

_SLUG_RE = re.compile(r"[^a-z0-9]+")


def _slugify(name: str) -> str:
    slug = _SLUG_RE.sub("-", name.lower().strip())
    return slug.strip("-")[:48] or "workspace"


def _unique_org_id(base: str) -> str:
    candidate = _slugify(base)
    if not store.get_organization(candidate):
        return candidate
    return f"{candidate}-{uuid.uuid4().hex[:8]}"


def bootstrap_user_organization(user_id: str, email: str | None = None) -> OrganizationMember:
    """Ensure the user belongs to at least one organization (auto-provision on first login)."""
    memberships = store.list_user_memberships(user_id)
    if memberships:
        return memberships[0]

    display = (email or user_id).split("@")[0].replace(".", " ").title()
    org_name = f"{display}'s Workspace"
    org_id = _unique_org_id(org_name)

    org = Organization(
        id=org_id,
        name=org_name,
        created_at=datetime.utcnow(),
        created_by=user_id,
        plan="trial",
    )
    store.create_organization(org)
    member = OrganizationMember(
        organization_id=org_id,
        user_id=user_id,
        role=OrgRole.owner,
        email=email,
        joined_at=datetime.utcnow(),
    )
    store.add_organization_member(member)
    return member


def ensure_default_organization() -> Organization:
    existing = store.get_organization(settings.default_organization_id)
    if existing:
        return existing
    org = Organization(
        id=settings.default_organization_id,
        name="Default Organization",
        created_at=datetime.utcnow(),
        created_by="system",
        plan="trial",
    )
    store.create_organization(org)
    return org


def resolve_organization_for_actor(
    user_id: str,
    *,
    email: str | None = None,
    requested_org_id: str | None = None,
    claim_org_id: str | None = None,
) -> tuple[str, OrgRole]:
    """Resolve which organization the request operates in and the member's role."""
    if settings.app_env != "production" and user_id in {"admin", "viewer"}:
        ensure_default_organization()
        return (
            settings.default_organization_id,
            OrgRole.owner if user_id == "admin" else OrgRole.viewer,
        )

    if email:
        from app.services.members import accept_pending_invites

        accept_pending_invites(user_id, email)

    memberships = store.list_user_memberships(user_id)
    if not memberships:
        member = bootstrap_user_organization(user_id, email=email)
        memberships = [member]

    by_org = {m.organization_id: m for m in memberships}

    target = requested_org_id or claim_org_id
    if target:
        member = by_org.get(target)
        if member is None:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail="You are not a member of the requested organization",
            )
        return member.organization_id, member.role

    primary = memberships[0]
    return primary.organization_id, primary.role


def create_organization_for_user(user_id: str, payload: OrganizationCreate, email: str | None = None) -> Organization:
    org_id = _unique_org_id(payload.name)
    org = Organization(
        id=org_id,
        name=payload.name.strip(),
        created_at=datetime.utcnow(),
        created_by=user_id,
        plan="trial",
    )
    store.create_organization(org)
    store.add_organization_member(
        OrganizationMember(
            organization_id=org_id,
            user_id=user_id,
            role=OrgRole.owner,
            email=email,
            joined_at=datetime.utcnow(),
        )
    )
    return org


def ensure_dev_actor_membership(user_id: str, role: OrgRole) -> str:
    """Ensure the default dev organization exists and the dev user belongs to it."""
    org = ensure_default_organization()
    if store.get_organization_member(org.id, user_id) is None:
        store.add_organization_member(
            OrganizationMember(
                organization_id=org.id,
                user_id=user_id,
                role=role,
                joined_at=datetime.utcnow(),
            )
        )
    return org.id


def get_organization_context(user_id: str, email: str | None = None) -> dict[str, Any]:
    if settings.app_env != "production" and user_id in {"admin", "viewer"}:
        org_id = ensure_dev_actor_membership(
            user_id,
            OrgRole.owner if user_id == "admin" else OrgRole.viewer,
        )
        org = store.get_organization(org_id)
        if org is None:
            raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
        role = OrgRole.owner if user_id == "admin" else OrgRole.viewer
        return {
            "primary_organization_id": org_id,
            "organizations": [
                {
                    "organization": org,
                    "role": role,
                    "is_primary": True,
                }
            ],
        }

    if email:
        from app.services.members import accept_pending_invites

        accept_pending_invites(user_id, email)

    memberships = store.list_user_memberships(user_id)
    if not memberships:
        member = bootstrap_user_organization(user_id, email=email)
        memberships = [member]

    orgs = []
    for member in memberships:
        org = store.get_organization(member.organization_id)
        if org:
            orgs.append(
                {
                    "organization": org,
                    "role": member.role,
                    "is_primary": member.organization_id == memberships[0].organization_id,
                }
            )

    return {
        "primary_organization_id": memberships[0].organization_id,
        "organizations": orgs,
    }


def require_org_admin(role: OrgRole) -> None:
    if role not in (OrgRole.owner, OrgRole.admin, OrgRole.security_admin):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admin role required",
        )


def dev_organization_id() -> str:
    return settings.default_organization_id
