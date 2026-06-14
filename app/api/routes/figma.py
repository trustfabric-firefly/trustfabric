# Figma integration API routes — list files, fetch frames, batch scan

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends

from app.core.rate_limit import RateLimited, TIER_DEFAULT, TIER_EXPENSIVE
from app.core.security import Actor, get_actor
from app.services.figma import (
    resolve_figma_token,
    get_team_projects,
    get_project_files,
    list_frames_in_file,
    fetch_frames_with_thumbnails,
    get_file_images,
    download_image,
)
from app.services.brand_compliance import scan_image_compliance
from app.services.store import store


router = APIRouter()


class BatchScanRequest(BaseModel):
    file_key: str
    node_ids: list[str] = Field(default_factory=list, description="Node IDs to scan. If empty, scans all frames.")


@router.get("/teams/{team_id}/projects", dependencies=[Depends(RateLimited(TIER_DEFAULT))])
def list_team_projects(
    team_id: str,
    actor: Actor = Depends(get_actor),
) -> dict:
    token = resolve_figma_token(actor.organization_id)
    projects = get_team_projects(token, team_id)
    return {"projects": projects}


@router.get("/projects/{project_id}/files", dependencies=[Depends(RateLimited(TIER_DEFAULT))])
def list_project_files_route(
    project_id: str,
    actor: Actor = Depends(get_actor),
) -> dict:
    token = resolve_figma_token(actor.organization_id)
    files = get_project_files(token, project_id)
    return {"files": files}


@router.get("/files/{file_key}/frames", dependencies=[Depends(RateLimited(TIER_DEFAULT))])
def list_file_frames(
    file_key: str,
    actor: Actor = Depends(get_actor),
) -> dict:
    """List all top-level frames/artboards in a Figma file with thumbnail URLs."""
    token = resolve_figma_token(actor.organization_id)
    frames = fetch_frames_with_thumbnails(token, file_key)
    return {"frames": frames, "count": len(frames)}


@router.post("/scan", dependencies=[Depends(RateLimited(TIER_EXPENSIVE))])
def batch_scan_figma_file(
    payload: BatchScanRequest,
    actor: Actor = Depends(get_actor),
) -> dict:
    """Scan frames from a Figma file for brand compliance."""
    token = resolve_figma_token(actor.organization_id)

    if payload.node_ids:
        node_ids = payload.node_ids
    else:
        frames = list_frames_in_file(token, payload.file_key)
        node_ids = [f["id"] for f in frames]

    if not node_ids:
        return {"results": [], "summary": {"total": 0}}

    image_urls = get_file_images(token, payload.file_key, node_ids, fmt="png", scale=2.0)

    active_policies = store.list_all_active_governance_policies(actor.organization_id)
    custom_rules = []
    for policy in active_policies:
        if policy.rules:
            custom_rules.append(f"Policy: {policy.name}")
            for rule in policy.rules:
                custom_rules.append(f"  - {rule}")

    results = []
    for node_id in node_ids:
        url = image_urls.get(node_id)
        if not url:
            results.append({
                "node_id": node_id,
                "status": "error",
                "error": "No image URL returned from Figma",
            })
            continue

        try:
            image_bytes, mime_type = download_image(url)
            compliance = scan_image_compliance(
                image_bytes=image_bytes,
                mime_type=mime_type,
                user_id=actor.user_id,
                custom_rules=custom_rules if custom_rules else None,
            )
            results.append({
                "node_id": node_id,
                "status": "scanned",
                **compliance,
            })
        except Exception as exc:
            results.append({
                "node_id": node_id,
                "status": "error",
                "error": str(exc)[:300],
            })

    scanned = [r for r in results if r["status"] == "scanned"]
    total_score = sum(r.get("overall_score", 0) for r in scanned)
    avg_score = round(total_score / len(scanned)) if scanned else 0
    compliant_count = sum(1 for r in scanned if r.get("overall_status") == "compliant")
    needs_review_count = sum(1 for r in scanned if r.get("overall_status") == "needs_review")
    non_compliant_count = sum(1 for r in scanned if r.get("overall_status") == "non_compliant")

    return {
        "results": results,
        "summary": {
            "total": len(results),
            "scanned": len(scanned),
            "errors": len(results) - len(scanned),
            "average_score": avg_score,
            "compliant": compliant_count,
            "needs_review": needs_review_count,
            "non_compliant": non_compliant_count,
        },
    }
