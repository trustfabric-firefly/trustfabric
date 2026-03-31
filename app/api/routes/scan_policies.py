from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import Actor, get_actor
from app.domain.models import ScanPolicy
from app.services.store import store

router = APIRouter()


class ScanPolicyToggle(BaseModel):
    enabled: bool


@router.get("/", response_model=List[ScanPolicy])
def list_scan_policies(actor: Actor = Depends(get_actor)) -> List[ScanPolicy]:
    """Return scan policies for the current user, seeding defaults if none exist."""
    return store.get_scan_policies(actor.user_id)


@router.patch("/{check_id}", response_model=ScanPolicy)
def toggle_scan_policy(
    check_id: str,
    body: ScanPolicyToggle,
    actor: Actor = Depends(get_actor),
) -> ScanPolicy:
    """Enable or disable a scan policy check."""
    try:
        return store.update_scan_policy(actor.user_id, check_id, body.enabled)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc))
