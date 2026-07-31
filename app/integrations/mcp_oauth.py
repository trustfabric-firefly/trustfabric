"""Universal OAuth 2.1 for MCP servers.

Implements the MCP authorization spec generically, so any compliant server works
without per-provider configuration:

* RFC 9728 — protected resource metadata (discovered from the 401 challenge)
* RFC 8414 — authorization server metadata
* RFC 7591 — dynamic client registration
* RFC 7636 — PKCE (S256, mandatory)
* RFC 8707 — resource indicators

Public clients only: no client secret is used or required.
"""

from __future__ import annotations

import base64
import hashlib
import secrets
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional
from urllib.parse import urlencode, urlparse, urlunparse

import httpx

_TIMEOUT = 15.0
_CLIENT_NAME = "TrustFabric AI Governance"


class MCPOAuthError(RuntimeError):
    """OAuth discovery, registration, or token exchange failed."""


@dataclass
class AuthorizationServerMetadata:
    issuer: str = ""
    authorization_endpoint: str = ""
    token_endpoint: str = ""
    registration_endpoint: str = ""
    scopes_supported: List[str] = field(default_factory=list)
    code_challenge_methods_supported: List[str] = field(default_factory=list)

    @property
    def supports_s256(self) -> bool:
        # Absent metadata is treated as S256-capable; PKCE is mandatory in OAuth 2.1.
        return (
            not self.code_challenge_methods_supported
            or "S256" in self.code_challenge_methods_supported
        )


@dataclass
class ProtectedResourceMetadata:
    resource: str = ""
    authorization_servers: List[str] = field(default_factory=list)
    scopes_supported: List[str] = field(default_factory=list)


def generate_pkce_pair() -> tuple[str, str]:
    """Return ``(verifier, challenge)`` for PKCE S256."""
    verifier = base64.urlsafe_b64encode(secrets.token_bytes(64)).decode().rstrip("=")
    digest = hashlib.sha256(verifier.encode("ascii")).digest()
    challenge = base64.urlsafe_b64encode(digest).decode().rstrip("=")
    return verifier, challenge


def _well_known_candidates(url: str, suffix: str) -> List[str]:
    """Build .well-known URLs for an issuer.

    RFC 8414 inserts the well-known segment *before* the path
    (``https://host/.well-known/x/mcp/trading``); many servers also expose the
    naive appended form. Both are tried, in spec order.
    """
    parsed = urlparse(url)
    path = parsed.path.rstrip("/")
    base = (parsed.scheme, parsed.netloc)
    candidates = [urlunparse((*base, f"/.well-known/{suffix}{path}", "", "", ""))]
    if path:
        candidates.append(urlunparse((*base, f"{path}/.well-known/{suffix}", "", "", "")))
    candidates.append(urlunparse((*base, f"/.well-known/{suffix}", "", "", "")))
    # Preserve order while removing duplicates.
    return list(dict.fromkeys(candidates))


async def _get_json(client: httpx.AsyncClient, url: str) -> Optional[Dict[str, Any]]:
    try:
        response = await client.get(url, headers={"Accept": "application/json"})
    except httpx.RequestError:
        return None
    if response.status_code != 200:
        return None
    try:
        payload = response.json()
    except ValueError:
        return None
    return payload if isinstance(payload, dict) else None


async def discover_protected_resource(
    client: httpx.AsyncClient,
    server_url: str,
    resource_metadata_url: Optional[str] = None,
) -> Optional[ProtectedResourceMetadata]:
    """Fetch RFC 9728 metadata, preferring the URL the server advertised."""
    urls: List[str] = []
    if resource_metadata_url:
        urls.append(resource_metadata_url)
    urls.extend(_well_known_candidates(server_url, "oauth-protected-resource"))

    for url in dict.fromkeys(urls):
        payload = await _get_json(client, url)
        if payload:
            return ProtectedResourceMetadata(
                resource=str(payload.get("resource", server_url)),
                authorization_servers=[str(a) for a in payload.get("authorization_servers") or []],
                scopes_supported=[str(s) for s in payload.get("scopes_supported") or []],
            )
    return None


async def discover_authorization_server(
    client: httpx.AsyncClient,
    issuer_url: str,
) -> Optional[AuthorizationServerMetadata]:
    """Fetch RFC 8414 metadata, falling back to OpenID discovery."""
    candidates = _well_known_candidates(issuer_url, "oauth-authorization-server")
    candidates += _well_known_candidates(issuer_url, "openid-configuration")

    for url in dict.fromkeys(candidates):
        payload = await _get_json(client, url)
        if not payload or not payload.get("authorization_endpoint"):
            continue
        return AuthorizationServerMetadata(
            issuer=str(payload.get("issuer", issuer_url)),
            authorization_endpoint=str(payload.get("authorization_endpoint", "")),
            token_endpoint=str(payload.get("token_endpoint", "")),
            registration_endpoint=str(payload.get("registration_endpoint", "")),
            scopes_supported=[str(s) for s in payload.get("scopes_supported") or []],
            code_challenge_methods_supported=[
                str(m) for m in payload.get("code_challenge_methods_supported") or []
            ],
        )
    return None


@dataclass
class DiscoveryResult:
    resource: ProtectedResourceMetadata
    auth_server: AuthorizationServerMetadata


async def discover(
    server_url: str,
    resource_metadata_url: Optional[str] = None,
) -> DiscoveryResult:
    """Run the full MCP auth discovery chain for an arbitrary server."""
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        resource = await discover_protected_resource(client, server_url, resource_metadata_url)
        if resource is None:
            # No RFC 9728 document — treat the server itself as its own issuer.
            resource = ProtectedResourceMetadata(
                resource=server_url, authorization_servers=[server_url]
            )

        issuers = resource.authorization_servers or [server_url]
        for issuer in issuers:
            metadata = await discover_authorization_server(client, issuer)
            if metadata:
                return DiscoveryResult(resource=resource, auth_server=metadata)

    raise MCPOAuthError(
        f"Could not discover an OAuth authorization server for {server_url}. "
        "The server may not implement the MCP authorization spec."
    )


async def register_client(
    registration_endpoint: str,
    redirect_uri: str,
    scopes: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """RFC 7591 dynamic client registration for a public client."""
    body: Dict[str, Any] = {
        "client_name": _CLIENT_NAME,
        "redirect_uris": [redirect_uri],
        "grant_types": ["authorization_code", "refresh_token"],
        "response_types": ["code"],
        "token_endpoint_auth_method": "none",
        "application_type": "web",
    }
    if scopes:
        body["scope"] = " ".join(scopes)

    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        try:
            response = await client.post(
                registration_endpoint,
                json=body,
                headers={"Content-Type": "application/json", "Accept": "application/json"},
            )
        except httpx.RequestError as exc:
            raise MCPOAuthError(f"Client registration request failed: {exc}") from exc

    if response.status_code not in (200, 201):
        snippet = response.text[:300].replace("\n", " ")
        raise MCPOAuthError(
            f"Client registration failed (HTTP {response.status_code}): {snippet}"
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise MCPOAuthError("Client registration returned a non-JSON response") from exc

    if not payload.get("client_id"):
        raise MCPOAuthError("Client registration response did not include a client_id")
    return payload


def build_authorization_url(
    metadata: AuthorizationServerMetadata,
    client_id: str,
    redirect_uri: str,
    state: str,
    code_challenge: str,
    resource: str,
    scopes: Optional[List[str]] = None,
) -> str:
    """Assemble the authorization URL the user's browser must visit."""
    if not metadata.supports_s256:
        raise MCPOAuthError("Authorization server does not support PKCE S256")

    params = {
        "response_type": "code",
        "client_id": client_id,
        "redirect_uri": redirect_uri,
        "state": state,
        "code_challenge": code_challenge,
        "code_challenge_method": "S256",
        # RFC 8707 — binds the issued token to this MCP server.
        "resource": resource,
    }
    if scopes:
        params["scope"] = " ".join(scopes)

    separator = "&" if "?" in metadata.authorization_endpoint else "?"
    return f"{metadata.authorization_endpoint}{separator}{urlencode(params)}"


async def _token_request(token_endpoint: str, form: Dict[str, str]) -> Dict[str, Any]:
    async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
        try:
            response = await client.post(
                token_endpoint,
                data=form,
                headers={
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                },
            )
        except httpx.RequestError as exc:
            raise MCPOAuthError(f"Token request failed: {exc}") from exc

    if response.status_code != 200:
        snippet = response.text[:300].replace("\n", " ")
        raise MCPOAuthError(f"Token request failed (HTTP {response.status_code}): {snippet}")

    try:
        payload = response.json()
    except ValueError as exc:
        raise MCPOAuthError("Token endpoint returned a non-JSON response") from exc

    if not payload.get("access_token"):
        raise MCPOAuthError("Token response did not include an access_token")
    return payload


async def exchange_code(
    token_endpoint: str,
    client_id: str,
    code: str,
    redirect_uri: str,
    code_verifier: str,
    resource: str,
) -> Dict[str, Any]:
    """Swap an authorization code for tokens (public client + PKCE)."""
    return await _token_request(
        token_endpoint,
        {
            "grant_type": "authorization_code",
            "code": code,
            "redirect_uri": redirect_uri,
            "client_id": client_id,
            "code_verifier": code_verifier,
            "resource": resource,
        },
    )


async def refresh_access_token(
    token_endpoint: str,
    client_id: str,
    refresh_token: str,
    resource: str,
) -> Dict[str, Any]:
    """Renew an expired access token."""
    return await _token_request(
        token_endpoint,
        {
            "grant_type": "refresh_token",
            "refresh_token": refresh_token,
            "client_id": client_id,
            "resource": resource,
        },
    )
