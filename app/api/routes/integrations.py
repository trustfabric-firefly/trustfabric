from __future__ import annotations

from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.security import Actor, get_actor
from app.domain.models import GitHubIntegrationStatus, GitHubUserInfo
from app.integrations.github import (
    build_oauth_url,
    decode_state,
    encode_state,
    exchange_code_for_token,
    get_user_info,
    get_user_orgs,
)
from app.services.store import store

router = APIRouter()


@router.get("/github/connect")
async def github_connect(actor: Actor = Depends(get_actor)) -> dict:
    """Return the GitHub OAuth URL. Frontend navigates the browser to this URL."""
    if not settings.github_client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured — set GITHUB_CLIENT_ID in .env")
    state = encode_state(actor.user_id)
    return {"url": build_oauth_url(state)}


@router.get("/github/callback")
async def github_callback(code: str = Query(...), state: str = Query(...)):
    """GitHub OAuth callback. GitHub redirects here after user authorises the app."""
    frontend = settings.frontend_url
    try:
        user_id = decode_state(state)
        token = await exchange_code_for_token(code)
        user_info = await get_user_info(token)
        orgs = await get_user_orgs(token)
        user_info["orgs"] = orgs
        store.save_github_connection(user_id, token, user_info)
        return RedirectResponse(url=f"{frontend}/settings?github=connected")
    except Exception as exc:
        safe = str(exc)[:120].replace("&", "and")
        return RedirectResponse(url=f"{frontend}/settings?github=error&detail={safe}")


@router.get("/github/status", response_model=GitHubIntegrationStatus)
async def github_status(actor: Actor = Depends(get_actor)) -> GitHubIntegrationStatus:
    """Check whether GitHub is connected for the authenticated user."""
    conn = store.get_github_connection(actor.user_id)
    if not conn or not conn.get("github_access_token"):
        return GitHubIntegrationStatus(connected=False)
    return GitHubIntegrationStatus(
        connected=True,
        user=GitHubUserInfo(
            login=conn["github_login"],
            name=conn.get("github_name"),
            avatar_url=conn.get("github_avatar_url", ""),
            public_repos=conn.get("github_public_repos", 0),
            orgs=conn.get("github_orgs", []),
            connected_at=datetime.fromisoformat(conn["github_connected_at"]),
        ),
    )


@router.delete("/github")
async def github_disconnect(actor: Actor = Depends(get_actor)) -> dict:
    """Remove the stored GitHub token for the authenticated user."""
    store.delete_github_connection(actor.user_id)
    return {"message": "GitHub disconnected"}
