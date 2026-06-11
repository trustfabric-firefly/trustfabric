from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import RedirectResponse
from pydantic import BaseModel

from app.core.config import settings
from app.core.security import Actor, get_actor, require_admin
from app.domain.models import (
    AwsConnectionInfo,
    AwsConnectRequest,
    AwsIntegrationStatus,
    GitHubIntegrationStatus,
    GitHubUserInfo,
    SlackConnectionInfo,
    SlackIntegrationStatus,
)
from app.integrations.github import (
    build_oauth_url,
    decode_state,
    encode_state,
    exchange_code_for_token,
    get_user_info,
    get_user_orgs,
)
from app.integrations import aws as aws_integration
from app.integrations import slack as slack_integration
from app.services.store import store

router = APIRouter()


# ── GitHub ────────────────────────────────────────────────────────────────────


@router.get("/github/connect")
async def github_connect(actor: Actor = Depends(require_admin)) -> dict:
    """Return the GitHub OAuth URL. Frontend navigates the browser to this URL."""
    if not settings.github_client_id:
        raise HTTPException(status_code=501, detail="GitHub OAuth not configured — set GITHUB_CLIENT_ID in .env")
    state = encode_state(actor.user_id, actor.organization_id)
    return {"url": build_oauth_url(state)}


@router.get("/github/callback")
async def github_callback(code: str = Query(...), state: str = Query(...)):
    """GitHub OAuth callback. GitHub redirects here after user authorises the app."""
    frontend = settings.frontend_url
    try:
        user_id, organization_id = decode_state(state)
        token = await exchange_code_for_token(code)
        user_info = await get_user_info(token)
        orgs = await get_user_orgs(token)
        user_info["orgs"] = orgs
        store.save_github_connection(organization_id, token, user_info)
        return RedirectResponse(url=f"{frontend}/settings?github=connected")
    except Exception as exc:
        safe = str(exc)[:120].replace("&", "and")
        return RedirectResponse(url=f"{frontend}/settings?github=error&detail={safe}")


@router.get("/github/status", response_model=GitHubIntegrationStatus)
async def github_status(actor: Actor = Depends(get_actor)) -> GitHubIntegrationStatus:
    """Check whether GitHub is connected for the authenticated user."""
    conn = store.get_github_connection(actor.organization_id)
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
async def github_disconnect(actor: Actor = Depends(require_admin)) -> dict:
    """Remove the stored GitHub token for the authenticated user."""
    store.delete_github_connection(actor.organization_id)
    return {"message": "GitHub disconnected"}


# ── Slack ─────────────────────────────────────────────────────────────────────


class SlackChannelUpdate(BaseModel):
    channel_id: str
    channel_name: str


@router.get("/slack/connect")
async def slack_connect(actor: Actor = Depends(require_admin)) -> dict:
    """Return the Slack OAuth URL. Frontend navigates the browser to this URL."""
    if not settings.slack_client_id:
        raise HTTPException(status_code=501, detail="Slack OAuth not configured — set SLACK_CLIENT_ID in .env")
    state = slack_integration.encode_state(actor.user_id, actor.organization_id)
    return {"url": slack_integration.build_oauth_url(state)}


@router.get("/slack/callback")
async def slack_callback(
    code: Optional[str] = Query(None),
    state: Optional[str] = Query(None),
    error: Optional[str] = Query(None),
):
    """Slack OAuth callback. Slack redirects here after user authorises the app."""
    frontend = settings.frontend_url
    if error:
        return RedirectResponse(url=f"{frontend}/settings?slack=error&detail={error}")
    if not code or not state:
        return RedirectResponse(url=f"{frontend}/settings?slack=error&detail=missing+code+or+state")
    try:
        user_id, organization_id = slack_integration.decode_state(state)
        data = await slack_integration.exchange_code_for_token(code)

        bot_token = data["access_token"]
        team_name = data.get("team", {}).get("name", "Unknown workspace")

        # Pick the first channel the bot can see as the default
        channels = await slack_integration.list_channels(bot_token)
        if channels:
            channel_id = channels[0]["id"]
            channel_name = channels[0]["name"]
        else:
            channel_id = ""
            channel_name = ""

        store.save_slack_connection(
            organization_id=organization_id,
            bot_token=bot_token,
            team_name=team_name,
            channel_id=channel_id,
            channel_name=channel_name,
        )
        return RedirectResponse(url=f"{frontend}/settings?slack=connected")
    except Exception as exc:
        safe = str(exc)[:120].replace("&", "and")
        return RedirectResponse(url=f"{frontend}/settings?slack=error&detail={safe}")


@router.get("/slack/status", response_model=SlackIntegrationStatus)
async def slack_status(actor: Actor = Depends(get_actor)) -> SlackIntegrationStatus:
    """Check whether Slack is connected for the authenticated user."""
    conn = store.get_slack_connection(actor.organization_id)
    if not conn:
        return SlackIntegrationStatus(connected=False)
    return SlackIntegrationStatus(
        connected=True,
        info=SlackConnectionInfo(
            team_name=conn.get("slack_team_name", ""),
            channel_id=conn.get("slack_channel_id", ""),
            channel_name=conn.get("slack_channel_name", ""),
            connected_at=datetime.fromisoformat(conn["slack_connected_at"]),
        ),
    )


@router.get("/slack/channels")
async def slack_channels(actor: Actor = Depends(get_actor)) -> List[dict]:
    """List channels the Slack bot can post to."""
    conn = store.get_slack_connection(actor.organization_id)
    if not conn:
        raise HTTPException(status_code=400, detail="Slack not connected")
    return await slack_integration.list_channels(conn["slack_bot_token"])


@router.patch("/slack/channel")
async def slack_update_channel(
    body: SlackChannelUpdate,
    actor: Actor = Depends(require_admin),
) -> dict:
    """Update the notification channel for the connected Slack workspace."""
    conn = store.get_slack_connection(actor.organization_id)
    if not conn:
        raise HTTPException(status_code=400, detail="Slack not connected")
    store.update_slack_channel(actor.organization_id, body.channel_id, body.channel_name)
    return {"message": f"Channel updated to #{body.channel_name}"}


@router.post("/slack/test")
async def slack_test(actor: Actor = Depends(require_admin)) -> dict:
    """Send a test notification to the configured Slack channel."""
    conn = store.get_slack_connection(actor.organization_id)
    if not conn:
        raise HTTPException(status_code=400, detail="Slack not connected")
    channel_id = conn.get("slack_channel_id")
    if not channel_id:
        raise HTTPException(status_code=400, detail="No channel configured")
    ok = await slack_integration.send_notification(
        token=conn["slack_bot_token"],
        channel_id=channel_id,
        text="TrustFabric test notification — Slack integration is working!",
    )
    if not ok:
        raise HTTPException(status_code=502, detail="Failed to post message to Slack")
    return {"message": "Test notification sent"}


@router.delete("/slack")
async def slack_disconnect(actor: Actor = Depends(require_admin)) -> dict:
    """Remove the stored Slack token for the authenticated user."""
    store.delete_slack_connection(actor.organization_id)
    return {"message": "Slack disconnected"}


# ── AWS ──────────────────────────────────────────────────────────────────────


@router.post("/aws/connect", response_model=AwsIntegrationStatus)
async def aws_connect(body: AwsConnectRequest, actor: Actor = Depends(require_admin)) -> AwsIntegrationStatus:
    """Validate the IAM Role ARN via STS AssumeRole and save the connection."""
    try:
        account_info = aws_integration.validate_connection(body.role_arn, body.region)
    except Exception as exc:
        raise HTTPException(
            status_code=400,
            detail=f"Failed to assume role: {str(exc)[:200]}",
        )

    store.save_aws_connection(
        organization_id=actor.organization_id,
        role_arn=body.role_arn,
        account_id=account_info["account_id"],
        account_alias=account_info.get("account_alias", ""),
        region=body.region,
    )
    return AwsIntegrationStatus(
        connected=True,
        info=AwsConnectionInfo(
            account_id=account_info["account_id"],
            account_alias=account_info.get("account_alias", ""),
            role_arn=body.role_arn,
            region=body.region,
            connected_at=datetime.utcnow(),
        ),
    )


@router.get("/aws/status", response_model=AwsIntegrationStatus)
async def aws_status(actor: Actor = Depends(get_actor)) -> AwsIntegrationStatus:
    """Check whether AWS is connected for the authenticated user."""
    conn = store.get_aws_connection(actor.organization_id)
    if not conn or not conn.get("aws_role_arn"):
        return AwsIntegrationStatus(connected=False)
    return AwsIntegrationStatus(
        connected=True,
        info=AwsConnectionInfo(
            account_id=conn.get("aws_account_id", ""),
            account_alias=conn.get("aws_account_alias", ""),
            role_arn=conn["aws_role_arn"],
            region=conn.get("aws_region", "us-east-1"),
            connected_at=datetime.fromisoformat(conn["aws_connected_at"]),
        ),
    )


@router.post("/aws/test")
async def aws_test(actor: Actor = Depends(require_admin)) -> dict:
    """Verify the stored AWS credentials still work."""
    conn = store.get_aws_connection(actor.organization_id)
    if not conn or not conn.get("aws_role_arn"):
        raise HTTPException(status_code=400, detail="AWS not connected")
    try:
        aws_integration.validate_connection(
            conn["aws_role_arn"],
            conn.get("aws_region", "us-east-1"),
        )
    except Exception as exc:
        raise HTTPException(status_code=502, detail=f"Connection test failed: {str(exc)[:200]}")
    return {"message": "AWS connection is valid"}


@router.delete("/aws")
async def aws_disconnect(actor: Actor = Depends(require_admin)) -> dict:
    """Remove the stored AWS connection for the authenticated user."""
    store.delete_aws_connection(actor.organization_id)
    return {"message": "AWS disconnected"}
