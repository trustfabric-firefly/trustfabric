from __future__ import annotations

import base64
from typing import List, Optional

import httpx

from app.core.config import settings

GITHUB_API = "https://api.github.com"
GITHUB_OAUTH_BASE = "https://github.com"
_SCOPES = "read:user,read:org,repo,manage_billing:copilot,security_events"


def _github_headers(token: str) -> dict:
    return {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}


def build_oauth_url(state: str) -> str:
    return (
        f"{GITHUB_OAUTH_BASE}/login/oauth/authorize"
        f"?client_id={settings.github_client_id}"
        f"&redirect_uri={settings.github_redirect_uri}"
        f"&scope={_SCOPES}"
        f"&state={state}"
    )


def encode_state(user_id: str) -> str:
    return base64.urlsafe_b64encode(user_id.encode()).decode()


def decode_state(state: str) -> str:
    return base64.urlsafe_b64decode(state.encode()).decode()


async def exchange_code_for_token(code: str) -> str:
    async with httpx.AsyncClient() as client:
        resp = await client.post(
            f"{GITHUB_OAUTH_BASE}/login/oauth/access_token",
            json={
                "client_id": settings.github_client_id,
                "client_secret": settings.github_client_secret,
                "code": code,
                "redirect_uri": settings.github_redirect_uri,
            },
            headers={"Accept": "application/json"},
            timeout=10,
        )
        resp.raise_for_status()
        data = resp.json()
        if "error" in data:
            raise ValueError(data.get("error_description", data["error"]))
        return data["access_token"]


async def get_user_info(token: str) -> dict:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/user",
            headers=_github_headers(token),
            timeout=10,
        )
        resp.raise_for_status()
        return resp.json()


async def get_user_orgs(token: str) -> List[str]:
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/user/orgs",
            headers=_github_headers(token),
            timeout=10,
        )
        if not resp.is_success:
            return []
        return [org["login"] for org in resp.json()]


async def get_user_repos(token: str) -> List[dict]:
    """Fetch the authenticated user's own repos (not forks, sorted by recent push)."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/user/repos",
            params={"type": "owner", "sort": "pushed", "per_page": 30},
            headers=_github_headers(token),
            timeout=15,
        )
        if not resp.is_success:
            return []
        return [r for r in resp.json() if not r.get("archived")]


async def get_org_repos(token: str, org: str) -> List[dict]:
    """Fetch repositories for a GitHub organization, sorted by recent push."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/orgs/{org}/repos",
            params={"type": "all", "sort": "pushed", "per_page": 30},
            headers=_github_headers(token),
            timeout=15,
        )
        if not resp.is_success:
            return []
        return [r for r in resp.json() if not r.get("archived")]


async def get_repo(token: str, owner: str, repo: str) -> Optional[dict]:
    """Fetch current repository metadata, including security settings when available."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}",
            headers=_github_headers(token),
            timeout=10,
        )
        if not resp.is_success:
            return None
        return resp.json()


async def get_branch_protection(token: str, owner: str, repo: str, branch: str) -> Optional[dict]:
    """Return branch protection config or None if not set."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/branches/{branch}/protection",
            headers=_github_headers(token),
            timeout=10,
        )
        if resp.status_code == 404:
            return None
        if not resp.is_success:
            return None
        return resp.json()


async def get_actions_permissions(token: str, owner: str, repo: str) -> Optional[dict]:
    """Return Actions permissions for a repo."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/repos/{owner}/{repo}/actions/permissions",
            headers=_github_headers(token),
            timeout=10,
        )
        if not resp.is_success:
            return None
        return resp.json()


async def get_copilot_config(token: str, org: str) -> Optional[dict]:
    """Fetch Copilot org-level billing/policy settings.
    Returns None when the org doesn't have Copilot Business/Enterprise or token lacks permission."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/orgs/{org}/copilot/billing",
            headers=_github_headers(token),
            timeout=10,
        )
        if resp.status_code in (401, 403, 404):
            return None
        resp.raise_for_status()
        return resp.json()


async def get_copilot_seats(token: str, org: str) -> Optional[dict]:
    """Fetch Copilot seat usage for an org.
    Returns None when the org doesn't have Copilot Business/Enterprise or token lacks permission."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/orgs/{org}/copilot/billing/seats",
            headers=_github_headers(token),
            timeout=10,
        )
        if resp.status_code in (401, 403, 404):
            return None
        if not resp.is_success:
            return None
        return resp.json()


async def get_org_info(token: str, org: str) -> Optional[dict]:
    """Fetch org metadata including two_factor_requirement_enabled.
    Returns None when the org is not found or token lacks permission."""
    async with httpx.AsyncClient() as client:
        resp = await client.get(
            f"{GITHUB_API}/orgs/{org}",
            headers=_github_headers(token),
            timeout=10,
        )
        if resp.status_code in (401, 403, 404):
            return None
        if not resp.is_success:
            return None
        return resp.json()
