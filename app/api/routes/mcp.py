"""MCP server registry and governance routes.

Registers arbitrary MCP servers per workspace, performs the read-only audit
(handshake + tools/list), and drives the universal OAuth 2.1 flow for servers
that require authorization.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status
from fastapi.responses import RedirectResponse

from app.core.config import settings
from app.core.oauth_state import decode_oauth_state, encode_oauth_state
from app.core.rate_limit import RateLimited, RateLimitedPublic, TIER_AUTH, TIER_EXPENSIVE
from app.core.security import Actor, get_actor, require_admin
from app.domain.models import (
    MCPAuthorizeResponse,
    MCPAuthStatus,
    MCPServer,
    MCPServerCreate,
    MCPToolInfo,
    MCPToolSummary,
)
from app.integrations import mcp_oauth
from app.integrations.mcp import (
    MCPAuthRequired,
    MCPClient,
    MCPError,
    summarize_tools,
)
from app.services.store import store

router = APIRouter()


def _redirect_uri() -> str:
    base = (settings.api_base_url or "http://localhost:8000").rstrip("/")
    return f"{base}/api/v1/mcp/oauth/callback"


def _to_model(doc: Dict[str, Any]) -> MCPServer:
    """Build the API model from a stored document, omitting secrets."""
    return MCPServer(
        id=str(doc.get("id", "")),
        organization_id=str(doc.get("organization_id", "")),
        name=str(doc.get("name", "")),
        url=str(doc.get("url", "")),
        auth_status=MCPAuthStatus(doc.get("auth_status", MCPAuthStatus.none.value)),
        connected=bool(doc.get("connected", False)),
        server_name=str(doc.get("server_name", "")),
        server_version=str(doc.get("server_version", "")),
        protocol_version=str(doc.get("protocol_version", "")),
        tools=[MCPToolInfo(**t) for t in doc.get("tools") or []],
        tool_summary=MCPToolSummary(**(doc.get("tool_summary") or {})),
        last_error=str(doc.get("last_error", "")),
        last_audited_at=_parse_dt(doc.get("last_audited_at")),
        created_at=_parse_dt(doc.get("created_at")) or datetime.utcnow(),
        updated_at=_parse_dt(doc.get("updated_at")) or datetime.utcnow(),
        oauth_authorization_endpoint=str(doc.get("oauth_authorization_endpoint", "")),
        oauth_token_endpoint=str(doc.get("oauth_token_endpoint", "")),
        oauth_registration_endpoint=str(doc.get("oauth_registration_endpoint", "")),
        oauth_resource=str(doc.get("oauth_resource", "")),
        oauth_scopes=[str(s) for s in doc.get("oauth_scopes") or []],
        oauth_client_id=str(doc.get("oauth_client_id", "")),
    )


def _parse_dt(value: Any) -> Optional[datetime]:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str) and value:
        try:
            return datetime.fromisoformat(value)
        except ValueError:
            return None
    return None


async def _audit_server(doc: Dict[str, Any]) -> Dict[str, Any]:
    """Run a read-only probe and fold the outcome into the stored document.

    Never raises: a probe failure is recorded as state, not an API error, so the
    registry always reflects reality rather than dropping the server.
    """
    patch: Dict[str, Any] = {"updated_at": datetime.utcnow().isoformat()}
    client = MCPClient(url=doc["url"], access_token=doc.get("access_token") or None)

    try:
        info, tools = await client.probe()
    except MCPAuthRequired as exc:
        patch.update({
            "connected": False,
            "auth_status": MCPAuthStatus.oauth_required.value,
            "last_error": "Server requires OAuth authorization",
        })
        # Cache discovery so the authorize step is a single click later.
        try:
            discovered = await mcp_oauth.discover(doc["url"], exc.resource_metadata_url)
            patch.update({
                "oauth_authorization_endpoint": discovered.auth_server.authorization_endpoint,
                "oauth_token_endpoint": discovered.auth_server.token_endpoint,
                "oauth_registration_endpoint": discovered.auth_server.registration_endpoint,
                "oauth_resource": discovered.resource.resource,
                "oauth_scopes": discovered.resource.scopes_supported
                or discovered.auth_server.scopes_supported,
            })
        except mcp_oauth.MCPOAuthError as disc_exc:
            patch["last_error"] = f"OAuth required but discovery failed: {disc_exc}"
        return patch
    except MCPError as exc:
        patch.update({
            "connected": False,
            "auth_status": MCPAuthStatus.error.value,
            "last_error": str(exc)[:500],
        })
        return patch

    summary = summarize_tools(tools)
    patch.update({
        "connected": True,
        "auth_status": (
            MCPAuthStatus.oauth_connected.value
            if doc.get("oauth_client_id")
            else MCPAuthStatus.bearer.value if doc.get("access_token")
            else MCPAuthStatus.none.value
        ),
        "server_name": info.name,
        "server_version": info.version,
        "protocol_version": info.protocol_version,
        "tools": [t.to_dict() for t in tools],
        "tool_summary": summary,
        "last_error": "",
        "last_audited_at": datetime.utcnow().isoformat(),
    })
    return patch


@router.get("/servers", response_model=List[MCPServer], summary="List registered MCP servers")
async def list_servers(actor: Actor = Depends(get_actor)) -> List[MCPServer]:
    return [_to_model(doc) for doc in store.list_mcp_servers(actor.organization_id)]


@router.post(
    "/servers",
    response_model=MCPServer,
    status_code=status.HTTP_201_CREATED,
    summary="Register an MCP server and audit it (admin only)",
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
async def register_server(
    payload: MCPServerCreate,
    actor: Actor = Depends(require_admin),
) -> MCPServer:
    existing = store.list_mcp_servers(actor.organization_id)
    if any(s.get("url") == payload.url for s in existing):
        raise HTTPException(
            status_code=status.HTTP_409_CONFLICT,
            detail=f"An MCP server with URL {payload.url} is already registered",
        )

    now = datetime.utcnow().isoformat()
    doc: Dict[str, Any] = {
        "id": uuid.uuid4().hex,
        "organization_id": actor.organization_id,
        "name": payload.name.strip(),
        "url": payload.url,
        "access_token": payload.access_token or "",
        "auth_status": MCPAuthStatus.bearer.value if payload.access_token else MCPAuthStatus.none.value,
        "connected": False,
        "created_at": now,
        "updated_at": now,
    }
    doc.update(await _audit_server(doc))
    store.save_mcp_server(actor.organization_id, doc["id"], doc)
    return _to_model(doc)


@router.get("/servers/{server_id}", response_model=MCPServer, summary="Get one MCP server")
async def get_server(server_id: str, actor: Actor = Depends(get_actor)) -> MCPServer:
    doc = store.get_mcp_server(actor.organization_id, server_id)
    if not doc:
        raise HTTPException(status_code=404, detail="MCP server not found")
    return _to_model(doc)


@router.post(
    "/servers/{server_id}/audit",
    response_model=MCPServer,
    summary="Re-audit an MCP server's exposed tools",
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
async def audit_server(server_id: str, actor: Actor = Depends(require_admin)) -> MCPServer:
    doc = store.get_mcp_server(actor.organization_id, server_id)
    if not doc:
        raise HTTPException(status_code=404, detail="MCP server not found")

    doc.update(await _audit_server(doc))
    store.save_mcp_server(actor.organization_id, server_id, doc)
    return _to_model(doc)


@router.delete(
    "/servers/{server_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Remove an MCP server (admin only)",
)
async def delete_server(server_id: str, actor: Actor = Depends(require_admin)) -> None:
    if not store.get_mcp_server(actor.organization_id, server_id):
        raise HTTPException(status_code=404, detail="MCP server not found")
    store.delete_mcp_server(actor.organization_id, server_id)


@router.post(
    "/servers/{server_id}/oauth/authorize",
    response_model=MCPAuthorizeResponse,
    summary="Begin the OAuth authorization flow for an MCP server (admin only)",
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
async def start_oauth(server_id: str, actor: Actor = Depends(require_admin)) -> MCPAuthorizeResponse:
    doc = store.get_mcp_server(actor.organization_id, server_id)
    if not doc:
        raise HTTPException(status_code=404, detail="MCP server not found")

    # Discover now if the earlier audit did not cache endpoints.
    if not doc.get("oauth_authorization_endpoint"):
        try:
            discovered = await mcp_oauth.discover(doc["url"])
        except mcp_oauth.MCPOAuthError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        doc.update({
            "oauth_authorization_endpoint": discovered.auth_server.authorization_endpoint,
            "oauth_token_endpoint": discovered.auth_server.token_endpoint,
            "oauth_registration_endpoint": discovered.auth_server.registration_endpoint,
            "oauth_resource": discovered.resource.resource,
            "oauth_scopes": discovered.resource.scopes_supported
            or discovered.auth_server.scopes_supported,
        })

    redirect_uri = _redirect_uri()
    client_id = doc.get("oauth_client_id") or ""

    # Register dynamically (RFC 7591) the first time we authorize this server.
    if not client_id:
        registration_endpoint = doc.get("oauth_registration_endpoint")
        if not registration_endpoint:
            raise HTTPException(
                status_code=400,
                detail=(
                    "This MCP server does not advertise a registration endpoint and no "
                    "client_id is configured, so authorization cannot be started."
                ),
            )
        try:
            registration = await mcp_oauth.register_client(
                registration_endpoint, redirect_uri, doc.get("oauth_scopes") or None
            )
        except mcp_oauth.MCPOAuthError as exc:
            raise HTTPException(status_code=400, detail=str(exc)) from exc
        client_id = str(registration["client_id"])
        doc["oauth_client_id"] = client_id

    verifier, challenge = mcp_oauth.generate_pkce_pair()
    doc["oauth_code_verifier"] = verifier

    metadata = mcp_oauth.AuthorizationServerMetadata(
        authorization_endpoint=doc["oauth_authorization_endpoint"],
        token_endpoint=doc.get("oauth_token_endpoint", ""),
    )
    # State carries identity; the server id rides along so the callback can find it.
    state = f"{encode_oauth_state(actor.user_id, actor.organization_id)}.{server_id}"

    try:
        url = mcp_oauth.build_authorization_url(
            metadata,
            client_id=client_id,
            redirect_uri=redirect_uri,
            state=state,
            code_challenge=challenge,
            resource=doc.get("oauth_resource") or doc["url"],
            scopes=doc.get("oauth_scopes") or None,
        )
    except mcp_oauth.MCPOAuthError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    doc["auth_status"] = MCPAuthStatus.oauth_required.value
    doc["updated_at"] = datetime.utcnow().isoformat()
    store.save_mcp_server(actor.organization_id, server_id, doc)
    return MCPAuthorizeResponse(authorization_url=url, server_id=server_id)


@router.get(
    "/oauth/callback",
    summary="OAuth redirect target for MCP server authorization",
    dependencies=[Depends(RateLimitedPublic(TIER_AUTH))],
)
async def oauth_callback(
    code: str = Query(default=""),
    state: str = Query(default=""),
    error: str = Query(default=""),
):
    frontend = settings.frontend_url.rstrip("/")

    def fail(detail: str) -> RedirectResponse:
        safe = detail[:120].replace("&", "and")
        return RedirectResponse(url=f"{frontend}/settings?mcp=error&detail={safe}")

    if error:
        return fail(f"Authorization denied: {error}")
    if not code or not state or "." not in state:
        return fail("Missing authorization code or state")

    encoded_state, _, server_id = state.rpartition(".")
    try:
        _user_id, organization_id = decode_oauth_state(encoded_state)
    except ValueError as exc:
        return fail(f"Invalid state: {exc}")

    doc = store.get_mcp_server(organization_id, server_id)
    if not doc:
        return fail("MCP server not found")

    verifier = doc.get("oauth_code_verifier")
    if not verifier:
        return fail("Authorization session expired; start the connection again")

    try:
        tokens = await mcp_oauth.exchange_code(
            token_endpoint=doc.get("oauth_token_endpoint", ""),
            client_id=doc.get("oauth_client_id", ""),
            code=code,
            redirect_uri=_redirect_uri(),
            code_verifier=verifier,
            resource=doc.get("oauth_resource") or doc["url"],
        )
    except mcp_oauth.MCPOAuthError as exc:
        return fail(str(exc))

    doc["access_token"] = str(tokens.get("access_token", ""))
    doc["refresh_token"] = str(tokens.get("refresh_token", "") or "")
    doc["oauth_code_verifier"] = ""  # single use
    doc["auth_status"] = MCPAuthStatus.oauth_connected.value

    # Immediately audit with the new token so the UI shows real tools.
    doc.update(await _audit_server(doc))
    store.save_mcp_server(organization_id, server_id, doc)

    return RedirectResponse(url=f"{frontend}/settings?mcp=connected")
