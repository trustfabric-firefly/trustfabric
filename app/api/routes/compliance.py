"""Compliance framework evaluation endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.idempotency import (
    begin_idempotent_request,
    cached_idempotency_response,
    complete_idempotent_request,
    get_idempotency_key,
)
from app.core.rate_limit import RateLimited, TIER_EXPENSIVE
from app.core.security import Actor, get_actor
from app.domain.models import WebhookEvent
from app.services import frameworks as fw_service
from app.services.store import store
from app.services.webhooks import dispatch_webhook_event

router = APIRouter(prefix="/compliance", tags=["compliance"])


class AttestationRequest(BaseModel):
    framework_id: str
    req_id: str
    item_index: int
    value: bool


async def _maybe_dispatch_compliance_alerts(organization_id: str, scan_id: str, results) -> None:
    alerts = []
    for result in results:
        failed = [req for req in result.requirements if req.status.value == "failed"]
        if not failed:
            continue
        alerts.append(
            {
                "framework_id": result.framework_id,
                "framework_name": result.framework_name,
                "scan_id": scan_id,
                "failed_requirements": len(failed),
                "requirements": [req.model_dump(mode="json") for req in failed[:5]],
            }
        )
    if not alerts:
        return
    try:
        await dispatch_webhook_event(
            organization_id,
            WebhookEvent.compliance_alert,
            {
                "alert_type": "framework_gaps",
                "scan_id": scan_id,
                "frameworks": alerts,
            },
        )
    except Exception:
        pass


@router.get("/frameworks")
async def list_frameworks(actor: Actor = Depends(get_actor)):
    """Return metadata for all available compliance frameworks."""
    return fw_service.list_frameworks()


@router.get("/evaluate/{scan_id}", dependencies=[Depends(RateLimited(TIER_EXPENSIVE))])
async def evaluate_scan(
    scan_id: str,
    actor: Actor = Depends(get_actor),
):
    scan = store.get_scan(scan_id, actor.organization_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    cached = store.get_framework_results(scan_id)
    if cached:
        return {"scan_id": scan_id, "frameworks": [r.model_dump() for r in cached]}

    results = []
    for fw_meta in fw_service.list_frameworks():
        fw_id = fw_meta["id"]
        attestations = store.get_attestations(actor.organization_id, fw_id)
        result = fw_service.evaluate_framework(scan, fw_id, attestations)
        if result:
            store.save_framework_result(actor.user_id, result)
            results.append(result)

    await _maybe_dispatch_compliance_alerts(actor.organization_id, scan_id, results)
    return {"scan_id": scan_id, "frameworks": [r.model_dump() for r in results]}


@router.get("/evaluate/{scan_id}/refresh", dependencies=[Depends(RateLimited(TIER_EXPENSIVE))])
async def evaluate_scan_refresh(
    scan_id: str,
    actor: Actor = Depends(get_actor),
):
    scan = store.get_scan(scan_id, actor.organization_id)
    if scan is None:
        raise HTTPException(status_code=404, detail="Scan not found")

    results = []
    for fw_meta in fw_service.list_frameworks():
        fw_id = fw_meta["id"]
        attestations = store.get_attestations(actor.organization_id, fw_id)
        result = fw_service.evaluate_framework(scan, fw_id, attestations)
        if result:
            store.save_framework_result(actor.user_id, result)
            results.append(result)

    await _maybe_dispatch_compliance_alerts(actor.organization_id, scan_id, results)
    return {"scan_id": scan_id, "frameworks": [r.model_dump() for r in results]}


@router.post("/attestations")
async def submit_attestation(
    body: AttestationRequest,
    request: Request,
    actor: Actor = Depends(get_actor),
):
    idempotency_key = get_idempotency_key(request)
    key, cached = begin_idempotent_request(
        actor.organization_id,
        idempotency_key,
        method=request.method,
        path=str(request.url.path),
    )
    if cached:
        return cached_idempotency_response(cached)

    store.save_attestation(
        actor.organization_id,
        actor.user_id,
        body.framework_id,
        body.req_id,
        body.item_index,
        body.value,
    )
    response_body = {"ok": True}
    complete_idempotent_request(
        actor.organization_id,
        key,
        status_code=status.HTTP_200_OK,
        response_body=response_body,
    )
    return response_body


@router.get("/attestations/{framework_id}")
async def get_attestations(
    framework_id: str,
    actor: Actor = Depends(get_actor),
):
    return store.get_attestations(actor.organization_id, framework_id)
