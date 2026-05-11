# Figma integration API routes — connect, list files, fetch frames, batch scan

from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Request

from app.core.rate_limit import rate_limit
from app.core.security import Actor, get_actor
from app.services.figma import (
    get_figma_user,
    get_team_projects,
    get_project_files,
    list_frames_in_file,
    fetch_frames_with_thumbnails,
    get_file_images,
    download_image,
)
from app.services.brand_compliance import scan_image_compliance


router = APIRouter()


@router.get("/status")
def figma_status(actor: Actor = Depends(get_actor)) -> dict:
    """Check Figma connection status and return user info."""
    try:
        user = get_figma_user()
        return {"connected": True, "user": user}
    except Exception as e:
        return {"connected": False, "error": str(e)[:200]}


@router.get("/teams/{team_id}/projects")
def list_team_projects(
    team_id: str,
    request: Request,
    actor: Actor = Depends(get_actor),
) -> dict:
    rate_limit(request)
    projects = get_team_projects(team_id)
    return {"projects": projects}


@router.get("/projects/{project_id}/files")
def list_project_files_route(
    project_id: str,
    request: Request,
    actor: Actor = Depends(get_actor),
) -> dict:
    rate_limit(request)
    files = get_project_files(project_id)
    return {"files": files}


@router.get("/files/{file_key}/frames")
def list_file_frames(
    file_key: str,
    request: Request,
    actor: Actor = Depends(get_actor),
) -> dict:
    """List all top-level frames/artboards in a Figma file with thumbnail URLs."""
    rate_limit(request)
    frames = fetch_frames_with_thumbnails(file_key)
    return {"frames": frames, "count": len(frames)}


class BatchScanRequest(BaseModel):
    file_key: str
    node_ids: list[str] = Field(default_factory=list, description="Node IDs to scan. If empty, scans all frames.")


@router.post("/scan")
def batch_scan_figma_file(
    payload: BatchScanRequest,
    request: Request,
    actor: Actor = Depends(get_actor),
) -> dict:
    """Scan frames from a Figma file for brand compliance.
    If node_ids is empty, scans all top-level frames."""
    rate_limit(request)

    # Get frames to scan
    if payload.node_ids:
        node_ids = payload.node_ids
    else:
        frames = list_frames_in_file(payload.file_key)
        node_ids = [f["id"] for f in frames]

    if not node_ids:
        return {"results": [], "summary": {"total": 0}}

    # Export full-res images from Figma
    image_urls = get_file_images(payload.file_key, node_ids, fmt="png", scale=2.0)

    # Fetch all active policies from DB that might apply to design/brand
    from app.services.store import store
    active_policies = store.list_all_active_governance_policies()
    
    # We will pass all active policy rules as custom instructions
    # This allows users to enforce things like "Use blue color palette" across the org
    custom_rules = []
    for p in active_policies:
        # Just grab all rules from active policies for maximum enforcement coverage,
        # or we could filter by category if needed.
        if p.rules:
            custom_rules.append(f"Policy: {p.name}")
            for r in p.rules:
                custom_rules.append(f"  - {r}")

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
        except Exception as e:
            results.append({
                "node_id": node_id,
                "status": "error",
                "error": str(e)[:300],
            })

    # Build summary
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
