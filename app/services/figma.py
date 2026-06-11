# Figma integration service — fetches designs from Figma API and enables batch compliance scanning

from __future__ import annotations

import httpx
from typing import Any
from fastapi import HTTPException, status

from app.services.store import store


FIGMA_API_BASE = "https://api.figma.com/v1"


def resolve_figma_token(organization_id: str) -> str:
    """Return the Figma PAT for an organization. Tokens are stored encrypted per tenant."""
    conn = store.get_figma_connection(organization_id)
    if conn and conn.get("figma_access_token"):
        return str(conn["figma_access_token"])
    raise HTTPException(
        status_code=status.HTTP_400_BAD_REQUEST,
        detail="Figma is not connected for this workspace. Add a personal access token in Settings.",
    )


def _headers(token: str) -> dict[str, str]:
    return {"X-Figma-Token": token}


def get_figma_user(token: str) -> dict[str, Any]:
    """Get the authenticated Figma user info."""
    resp = httpx.get(f"{FIGMA_API_BASE}/me", headers=_headers(token), timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Figma API error: {resp.text[:300]}")
    return resp.json()


def get_team_projects(token: str, team_id: str) -> list[dict[str, Any]]:
    """List all projects in a Figma team."""
    resp = httpx.get(f"{FIGMA_API_BASE}/teams/{team_id}/projects", headers=_headers(token), timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Figma API error: {resp.text[:300]}")
    return resp.json().get("projects", [])


def get_project_files(token: str, project_id: str) -> list[dict[str, Any]]:
    """List all files in a Figma project."""
    resp = httpx.get(f"{FIGMA_API_BASE}/projects/{project_id}/files", headers=_headers(token), timeout=15)
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Figma API error: {resp.text[:300]}")
    return resp.json().get("files", [])


def get_file_metadata(token: str, file_key: str) -> dict[str, Any]:
    """Get metadata for a specific Figma file (pages, frames, etc.)."""
    resp = httpx.get(
        f"{FIGMA_API_BASE}/files/{file_key}",
        headers=_headers(token),
        params={"depth": 4},
        timeout=30,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Figma API error: {resp.text[:300]}")
    return resp.json()


def get_file_images(
    token: str,
    file_key: str,
    node_ids: list[str],
    fmt: str = "png",
    scale: float = 1.0,
) -> dict[str, str]:
    """Export specific nodes from a Figma file as images. Returns {node_id: image_url}."""
    resp = httpx.get(
        f"{FIGMA_API_BASE}/images/{file_key}",
        headers=_headers(token),
        params={"ids": ",".join(node_ids), "format": fmt, "scale": str(scale)},
        timeout=60,
    )
    if resp.status_code != 200:
        raise HTTPException(status_code=resp.status_code, detail=f"Figma image export error: {resp.text[:300]}")
    return resp.json().get("images", {})


def download_image(url: str) -> tuple[bytes, str]:
    """Download an image from a URL. Returns (bytes, mime_type)."""
    resp = httpx.get(url, timeout=30, follow_redirects=True)
    if resp.status_code != 200:
        raise HTTPException(status_code=502, detail="Failed to download image from Figma CDN")
    return resp.content, resp.headers.get("content-type", "image/png")


def list_frames_in_file(token: str, file_key: str) -> list[dict[str, Any]]:
    """Get all top-level elements (artboards) directly on the Figma canvas."""
    meta = get_file_metadata(token, file_key)
    frames = []
    document = meta.get("document", {})
    file_name = meta.get("name", "Untitled")

    for page in document.get("children", []):
        page_name = page.get("name", "Page")
        for child in page.get("children", []):
            width = child.get("absoluteBoundingBox", {}).get("width", 0)
            height = child.get("absoluteBoundingBox", {}).get("height", 0)
            if width > 10 and height > 10:
                frames.append({
                    "id": child["id"],
                    "name": child.get("name", "Untitled"),
                    "type": child.get("type", "ELEMENT"),
                    "page": page_name,
                    "file_key": file_key,
                    "file_name": file_name,
                    "width": width,
                    "height": height,
                })

    return frames


def fetch_frames_with_thumbnails(token: str, file_key: str) -> list[dict[str, Any]]:
    """Get all frames in a file along with their rendered thumbnail URLs."""
    frames = list_frames_in_file(token, file_key)
    if not frames:
        return []

    node_ids = [f["id"] for f in frames]
    image_map: dict[str, str] = {}
    for i in range(0, len(node_ids), 50):
        batch = node_ids[i:i + 50]
        batch_images = get_file_images(token, file_key, batch, fmt="png", scale=0.5)
        image_map.update(batch_images)

    for frame in frames:
        frame["thumbnail_url"] = image_map.get(frame["id"])

    return frames
