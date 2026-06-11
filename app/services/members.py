from __future__ import annotations

import re
import uuid
from datetime import datetime

from fastapi import HTTPException, status

from app.core.security import Actor
from app.domain.models import (
    AuditEventType,
    OrganizationInvite,
    OrganizationInviteCreate,
    OrganizationInviteStatus,
    OrganizationMember,
    OrganizationMemberUpdate,
    OrgRole,
)
from app.integrations.firebase import lookup_user_id_by_email
from app.services.store import store

_ADMIN_ROLES = {OrgRole.owner, OrgRole.admin, OrgRole.security_admin}
_EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


def normalize_email(email: str) -> str:
    return email.strip().lower()


def _validate_email(email: str) -> str:
    normalized = normalize_email(email)
    if not _EMAIL_RE.match(normalized):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid email address")
    return normalized


def _count_owners(organization_id: str) -> int:
    return sum(
        1
        for member in store.list_organization_members(organization_id)
        if member.role == OrgRole.owner
    )


def _invitable_roles(actor_role: OrgRole) -> set[OrgRole]:
    if actor_role == OrgRole.owner:
        return {OrgRole.admin, OrgRole.security_admin, OrgRole.auditor, OrgRole.viewer}
    if actor_role == OrgRole.admin:
        return {OrgRole.admin, OrgRole.security_admin, OrgRole.auditor, OrgRole.viewer}
    if actor_role == OrgRole.security_admin:
        return {OrgRole.auditor, OrgRole.viewer}
    return set()


def _manageable_roles(actor_role: OrgRole) -> set[OrgRole]:
    if actor_role == OrgRole.owner:
        return {OrgRole.owner, OrgRole.admin, OrgRole.security_admin, OrgRole.auditor, OrgRole.viewer}
    if actor_role == OrgRole.admin:
        return {OrgRole.admin, OrgRole.security_admin, OrgRole.auditor, OrgRole.viewer}
    if actor_role == OrgRole.security_admin:
        return {OrgRole.auditor, OrgRole.viewer}
    return set()


def _ensure_actor_can_manage(actor: Actor) -> None:
    if actor.org_role not in _ADMIN_ROLES:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Organization admin role required",
        )


def _ensure_role_assignable(actor: Actor, role: OrgRole) -> None:
    if role == OrgRole.owner:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Owner role cannot be assigned via invite or role update",
        )
    allowed = _invitable_roles(actor.org_role)
    if role not in allowed:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role cannot assign the '{role.value}' role",
        )


def _ensure_can_manage_target(actor: Actor, target: OrganizationMember) -> None:
    if target.user_id == actor.user_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You cannot modify your own membership",
        )
    manageable = _manageable_roles(actor.org_role)
    if target.role not in manageable:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Your role cannot manage members with the '{target.role.value}' role",
        )


def _ensure_not_last_owner(organization_id: str, target: OrganizationMember, action: str) -> None:
    if target.role == OrgRole.owner and _count_owners(organization_id) <= 1:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Cannot {action} the last organization owner",
        )


def accept_pending_invites(user_id: str, email: str | None) -> list[OrganizationMember]:
    """Attach pending workspace invites to a user after they authenticate."""
    if not email:
        return []

    accepted: list[OrganizationMember] = []
    for invite in store.list_pending_invites_for_email(email):
        if store.get_organization_member(invite.organization_id, user_id):
            accepted_invite = invite.model_copy(
                update={
                    "status": OrganizationInviteStatus.accepted,
                    "accepted_at": datetime.utcnow(),
                }
            )
            store.update_organization_invite(accepted_invite)
            continue

        member = OrganizationMember(
            organization_id=invite.organization_id,
            user_id=user_id,
            role=invite.role,
            email=normalize_email(email),
            joined_at=datetime.utcnow(),
        )
        store.add_organization_member(member)
        store.update_organization_invite(
            invite.model_copy(
                update={
                    "status": OrganizationInviteStatus.accepted,
                    "accepted_at": datetime.utcnow(),
                }
            )
        )
        store._record_audit(
            AuditEventType.member_invited,
            None,
            invite.invited_by,
            invite.organization_id,
            f"Accepted invite for {invite.email} as {invite.role.value}",
        )
        accepted.append(member)
    return accepted


def invite_member(actor: Actor, payload: OrganizationInviteCreate) -> dict:
    _ensure_actor_can_manage(actor)
    email = _validate_email(payload.email)
    _ensure_role_assignable(actor, payload.role)

    if actor.email and normalize_email(actor.email) == email:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="You are already a member")

    if store.get_organization_member_by_email(actor.organization_id, email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")

    if store.get_pending_invite_for_email(actor.organization_id, email):
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="A pending invite already exists")

    existing_user_id = lookup_user_id_by_email(email)
    if existing_user_id:
        if store.get_organization_member(actor.organization_id, existing_user_id):
            raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail="User is already a member")

        member = OrganizationMember(
            organization_id=actor.organization_id,
            user_id=existing_user_id,
            role=payload.role,
            email=email,
            joined_at=datetime.utcnow(),
        )
        store.add_organization_member(member)
        store._record_audit(
            AuditEventType.member_invited,
            None,
            actor.user_id,
            actor.organization_id,
            f"Added {email} as {payload.role.value}",
        )
        return {"status": "added", "member": member}

    invite = OrganizationInvite(
        id=uuid.uuid4().hex,
        organization_id=actor.organization_id,
        email=email,
        role=payload.role,
        invited_by=actor.user_id,
        status=OrganizationInviteStatus.pending,
        created_at=datetime.utcnow(),
    )
    store.create_organization_invite(invite)
    store._record_audit(
        AuditEventType.member_invited,
        None,
        actor.user_id,
        actor.organization_id,
        f"Invited {email} as {payload.role.value}",
    )
    return {"status": "invited", "invite": invite}


def list_pending_invites(actor: Actor) -> list[OrganizationInvite]:
    _ensure_actor_can_manage(actor)
    return store.list_organization_invites(actor.organization_id, status=OrganizationInviteStatus.pending)


def revoke_invite(actor: Actor, invite_id: str) -> dict:
    _ensure_actor_can_manage(actor)
    invite = store.get_organization_invite(actor.organization_id, invite_id)
    if invite is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Invite not found")
    if invite.status != OrganizationInviteStatus.pending:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invite is no longer pending")

    revoked = invite.model_copy(update={"status": OrganizationInviteStatus.revoked})
    store.update_organization_invite(revoked)
    store._record_audit(
        AuditEventType.invite_revoked,
        None,
        actor.user_id,
        actor.organization_id,
        f"Revoked invite for {invite.email}",
    )
    return {"ok": True}


def update_member_role(actor: Actor, target_user_id: str, payload: OrganizationMemberUpdate) -> OrganizationMember:
    _ensure_actor_can_manage(actor)
    _ensure_role_assignable(actor, payload.role)

    target = store.get_organization_member(actor.organization_id, target_user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    _ensure_can_manage_target(actor, target)
    if target.role == payload.role:
        return target

    if target.role == OrgRole.owner:
        _ensure_not_last_owner(actor.organization_id, target, "demote")

    updated = target.model_copy(update={"role": payload.role})
    store.update_organization_member(updated)
    store._record_audit(
        AuditEventType.member_role_changed,
        None,
        actor.user_id,
        actor.organization_id,
        f"Changed {target.email or target.user_id} from {target.role.value} to {payload.role.value}",
    )
    return updated


def remove_member(actor: Actor, target_user_id: str) -> dict:
    _ensure_actor_can_manage(actor)

    target = store.get_organization_member(actor.organization_id, target_user_id)
    if target is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Member not found")

    _ensure_can_manage_target(actor, target)
    _ensure_not_last_owner(actor.organization_id, target, "remove")

    store.remove_organization_member(actor.organization_id, target_user_id)
    store._record_audit(
        AuditEventType.member_removed,
        None,
        actor.user_id,
        actor.organization_id,
        f"Removed {target.email or target.user_id} ({target.role.value})",
    )
    return {"ok": True}
