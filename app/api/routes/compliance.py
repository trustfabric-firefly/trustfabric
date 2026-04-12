"""Compliance framework evaluation endpoints.

GET  /api/v1/compliance/frameworks          → list available frameworks
GET  /api/v1/compliance/evaluate/{scan_id} → evaluate scan against all frameworks
POST /api/v1/compliance/attestations        → submit manual checklist attestation
GET  /api/v1/compliance/attestations/{framework_id} → get attestations for a framework
"""

from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel

from app.core.security import Actor, get_actor
from app.services import frameworks as fw_service
from app.services.store import store

router = APIRouter(prefix="/compliance", tags=["compliance"])


class AttestationRequest(BaseModel):
    framework_id: str
    req_id: str
    item_index: int
    value: bool


@router.get("/frameworks")
async def list_frameworks(actor: Actor = Depends(get_actor)):
    """Return metadata for all available compliance frameworks."""
    return fw_service.list_frameworks()


@router.get("/evaluate/{scan_id}")
async def evaluate_scan(
    scan_id: str,
    actor: Actor = Depends(get_actor),
):
    """Evaluate a completed scan against all loaded frameworks.

    Results are cached in Firestore under scans/{scan_id}/frameworks.
    If cached results exist they are returned immediately (use ?refresh=true to force re-evaluation).
    """
    scan = store.get_scan(scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    # Try to return cached results first
    cached = store.get_framework_results(scan_id)
    if cached:
        return {"scan_id": scan_id, "frameworks": [r.model_dump() for r in cached]}

    # Load attestations per framework and evaluate
    results = []
    for fw_meta in fw_service.list_frameworks():
        fw_id = fw_meta["id"]
        attestations = store.get_attestations(actor.user_id, fw_id)
        result = fw_service.evaluate_framework(scan, fw_id, attestations)
        if result:
            store.save_framework_result(actor.user_id, result)
            results.append(result)

    return {"scan_id": scan_id, "frameworks": [r.model_dump() for r in results]}


@router.get("/evaluate/{scan_id}/refresh")
async def evaluate_scan_refresh(
    scan_id: str,
    actor: Actor = Depends(get_actor),
):
    """Force re-evaluation of a scan (e.g., after new attestations are submitted)."""
    scan = store.get_scan(scan_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    results = []
    for fw_meta in fw_service.list_frameworks():
        fw_id = fw_meta["id"]
        attestations = store.get_attestations(actor.user_id, fw_id)
        result = fw_service.evaluate_framework(scan, fw_id, attestations)
        if result:
            store.save_framework_result(actor.user_id, result)
            results.append(result)

    return {"scan_id": scan_id, "frameworks": [r.model_dump() for r in results]}


@router.post("/attestations")
async def submit_attestation(
    body: AttestationRequest,
    actor: Actor = Depends(get_actor),
):
    """Save a manual checklist attestation for a framework requirement."""
    store.save_attestation(
        actor.user_id,
        body.framework_id,
        body.req_id,
        body.item_index,
        body.value,
    )
    return {"ok": True}


@router.get("/attestations/{framework_id}")
async def get_attestations(
    framework_id: str,
    actor: Actor = Depends(get_actor),
):
    """Get all attestations for a given framework."""
    return store.get_attestations(actor.user_id, framework_id)
