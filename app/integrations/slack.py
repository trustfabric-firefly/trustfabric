from __future__ import annotations

import logging
from typing import List, Optional
from urllib.parse import urlencode

import httpx

from app.core.config import settings
from app.core.oauth_state import decode_oauth_state, encode_oauth_state

logger = logging.getLogger(__name__)

SLACK_API = "https://slack.com/api"
SLACK_OAUTH_BASE = "https://slack.com"
_BOT_SCOPES = "chat:write,channels:read"


def _slack_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Content-Type": "application/json; charset=utf-8"}


def build_oauth_url(state: str) -> str:
    params = urlencode({
        "client_id": settings.slack_client_id,
        "redirect_uri": settings.slack_redirect_uri,
        "scope": _BOT_SCOPES,
        "state": state,
    })
    return f"{SLACK_OAUTH_BASE}/oauth/v2/authorize?{params}"


def encode_state(user_id: str, organization_id: str) -> str:
    return encode_oauth_state(user_id, organization_id)


def decode_state(state: str) -> tuple[str, str]:
    return decode_oauth_state(state)


async def exchange_code_for_token(code: str) -> dict:
    """Exchange the OAuth code for a bot access token.

    Returns the full response dict containing ``access_token``, ``team``, etc.
    """
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SLACK_API}/oauth.v2.access",
            data={
                "client_id": settings.slack_client_id,
                "client_secret": settings.slack_client_secret,
                "code": code,
                "redirect_uri": settings.slack_redirect_uri,
            },
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(data.get("error", "Slack OAuth exchange failed"))
        return data


async def get_team_info(token: str) -> dict:
    """Call auth.test to get workspace/team metadata."""
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{SLACK_API}/auth.test",
            headers=_slack_headers(token),
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if not data.get("ok"):
            raise ValueError(data.get("error", "auth.test failed"))
        return data


async def list_channels(token: str) -> List[dict]:
    """Return public channels the bot can post to."""
    channels: List[dict] = []
    cursor: Optional[str] = None
    async with httpx.AsyncClient() as client:
        for _ in range(5):  # page limit
            params: dict = {"types": "public_channel", "limit": 200, "exclude_archived": "true"}
            if cursor:
                params["cursor"] = cursor
            resp = await client.get(
                f"{SLACK_API}/conversations.list",
                params=params,
                headers=_slack_headers(token),
                timeout=15,
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                break
            channels.extend(data.get("channels", []))
            cursor = data.get("response_metadata", {}).get("next_cursor")
            if not cursor:
                break
    return [{"id": c["id"], "name": c["name"]} for c in channels]


async def send_notification(
    token: str,
    channel_id: str,
    text: str,
    blocks: Optional[List[dict]] = None,
) -> bool:
    """Post a message to a Slack channel. Returns True on success."""
    payload: dict = {"channel": channel_id, "text": text}
    if blocks:
        payload["blocks"] = blocks
    try:
        async with httpx.AsyncClient() as client:
            resp = await client.post(
                f"{SLACK_API}/chat.postMessage",
                json=payload,
                headers=_slack_headers(token),
                timeout=10,
            )
            resp.raise_for_status()
            data = resp.json()
            if not data.get("ok"):
                logger.warning("Slack chat.postMessage failed: %s", data.get("error"))
                return False
            return True
    except Exception:
        logger.warning("Failed to send Slack notification", exc_info=True)
        return False
