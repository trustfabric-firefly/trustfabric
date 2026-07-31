from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import Actor, get_actor
from app.domain.models import GovernancePolicy, ScanPolicy
from app.services.store import store

router = APIRouter()


class ScanPolicyToggle(BaseModel):
    enabled: bool


@router.get("/", response_model=List[ScanPolicy])
def list_scan_policies(actor: Actor = Depends(get_actor)) -> List[ScanPolicy]:
    """Return scan policies for the current organization, seeding defaults if none exist."""
    return store.get_scan_policies(actor.organization_id)


@router.get("/github-custom", response_model=List[GovernancePolicy])
def list_github_custom_policies(actor: Actor = Depends(get_actor)) -> List[GovernancePolicy]:
    """Return active custom policies that can be selected for a GitHub scan.

    Custom policies remain managed in Policy Management; once active, this endpoint
    makes them available to the GitHub integration alongside its built-in checks.
    """
    return store.list_all_active_governance_policies(actor.organization_id)


@router.patch("/{check_id}", response_model=ScanPolicy)
def toggle_scan_policy(
    check_id: str,
    body: ScanPolicyToggle,
    actor: Actor = Depends(get_actor),
) -> ScanPolicy:
    """Enable or disable a scan policy check."""
    try:
        return store.update_scan_policy(actor.organization_id, check_id, body.enabled)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
