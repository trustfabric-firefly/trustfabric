from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException

from app.core.security import Actor, get_actor
from app.domain.models import ScanRecord, ScanTriggerRequest
from app.services.scan import run_scan
from app.services.store import store

router = APIRouter()


@router.post("/", response_model=ScanRecord)
async def trigger_scan(body: ScanTriggerRequest, actor: Actor = Depends(get_actor)) -> ScanRecord:
    """Run a compliance scan against the connected GitHub account."""
    try:
        return await run_scan(
            user_id=actor.user_id,
            github_org=body.github_org,
            triggered_by=actor.user_id,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc))
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Scan failed: {str(exc)}")


@router.get("/", response_model=List[ScanRecord])
def list_scans(actor: Actor = Depends(get_actor)) -> List[ScanRecord]:
    """Return scan history for the current user."""
    return store.list_scans(actor.user_id)


@router.get("/{scan_id}", response_model=ScanRecord)
def get_scan(scan_id: str, actor: Actor = Depends(get_actor)) -> ScanRecord:
    record = store.get_scan(scan_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return record
