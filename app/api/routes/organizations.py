from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import Actor, get_actor, require_admin
from app.domain.models import (
    OrganizationCopilotControls,
    OrganizationCopilotQuotaUpdate,
    OrganizationCreate,
    OrganizationInvite,
    OrganizationInviteCreate,
    OrganizationMember,
    OrganizationMemberUpdate,
    OrganizationSsoConfigUpdate,
    OrganizationUpdate,
)
from app.services.copilot_quota import get_controls, update_quota
from app.services.members import (
    invite_member,
    list_pending_invites,
    remove_member,
    revoke_invite,
    update_member_role,
)
from app.services.organizations import create_organization_for_user, get_organization_context
from app.services.sso import public_sso_summary, upsert_organization_sso_config
from app.services.store import store

router = APIRouter()


@router.get("/me", summary="Current user's organization context")
def get_my_organizations(actor: Actor = Depends(get_actor)) -> dict:
    return get_organization_context(actor.user_id, email=actor.email)


@router.get("/current", summary="Active organization details")
def get_current_organization(actor: Actor = Depends(get_actor)) -> dict:
    org = store.get_organization(actor.organization_id)
    if org is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return {
        "organization": org,
        "role": actor.org_role,
        "user_id": actor.user_id,
    }


@router.patch("/current", summary="Update active organization (admin only)")
def update_current_organization(
    payload: OrganizationUpdate,
    actor: Actor = Depends(require_admin),
) -> dict:
    updated = store.update_organization(actor.organization_id, payload)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Organization not found")
    return {"organization": updated}


@router.get("/current/members", response_model=List[OrganizationMember], summary="List org members")
def list_current_organization_members(actor: Actor = Depends(get_actor)) -> List[OrganizationMember]:
    return store.list_organization_members(actor.organization_id)


@router.patch(
    "/current/members/{user_id}",
    response_model=OrganizationMember,
    summary="Update a member role (admin only)",
)
def patch_organization_member(
    user_id: str,
    payload: OrganizationMemberUpdate,
    actor: Actor = Depends(require_admin),
) -> OrganizationMember:
    return update_member_role(actor, user_id, payload)


@router.delete("/current/members/{user_id}", summary="Remove a member (admin only)")
def delete_organization_member(user_id: str, actor: Actor = Depends(require_admin)) -> dict:
    return remove_member(actor, user_id)


@router.get(
    "/current/invites",
    response_model=List[OrganizationInvite],
    summary="List pending invites (admin only)",
)
def list_organization_invites(actor: Actor = Depends(require_admin)) -> List[OrganizationInvite]:
    return list_pending_invites(actor)


@router.post("/current/invites", summary="Invite a member by email (admin only)")
def create_organization_invite(
    payload: OrganizationInviteCreate,
    actor: Actor = Depends(require_admin),
) -> dict:
    return invite_member(actor, payload)


@router.delete("/current/invites/{invite_id}", summary="Revoke a pending invite (admin only)")
def delete_organization_invite(invite_id: str, actor: Actor = Depends(require_admin)) -> dict:
    return revoke_invite(actor, invite_id)


@router.get("/current/sso", summary="Get SSO configuration for active organization (admin only)")
def get_current_organization_sso(actor: Actor = Depends(require_admin)) -> dict:
    return public_sso_summary(actor.organization_id)


@router.put("/current/sso", summary="Configure SAML SSO for active organization (admin only)")
def update_current_organization_sso(
    payload: OrganizationSsoConfigUpdate,
    actor: Actor = Depends(require_admin),
) -> dict:
    config = upsert_organization_sso_config(actor.organization_id, payload)
    summary = public_sso_summary(actor.organization_id)
    summary["idp_x509_cert_configured"] = bool(config.idp_x509_cert)
    return summary


@router.delete("/current/sso", summary="Disable SAML SSO for active organization (admin only)")
def disable_current_organization_sso(actor: Actor = Depends(require_admin)) -> dict:
    store.delete_organization_sso_config(actor.organization_id)
    return public_sso_summary(actor.organization_id)


@router.get(
    "/current/copilot-controls",
    response_model=OrganizationCopilotControls,
    summary="Copilot usage and quota controls for the active organization",
)
def get_current_copilot_controls(actor: Actor = Depends(get_actor)) -> OrganizationCopilotControls:
    return get_controls(actor.organization_id)


@router.patch(
    "/current/copilot-controls",
    response_model=OrganizationCopilotControls,
    summary="Update copilot quotas and cost controls (admin only)",
)
def patch_current_copilot_controls(
    payload: OrganizationCopilotQuotaUpdate,
    actor: Actor = Depends(require_admin),
) -> OrganizationCopilotControls:
    return update_quota(actor.organization_id, payload)


@router.post("/", summary="Create a new organization (current user becomes owner)")
def create_organization(
    payload: OrganizationCreate,
    actor: Actor = Depends(require_admin),
) -> dict:
    org = create_organization_for_user(actor.user_id, payload, email=actor.email)
    return {"organization": org}
