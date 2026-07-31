from __future__ import annotations

import asyncio
import base64
import hashlib
import json

import httpx
import pytest

from app.integrations import mcp_oauth
from app.integrations.mcp import (
    MCPAuthRequired,
    MCPClient,
    MCPError,
    MCPTool,
    parse_www_authenticate,
    summarize_tools,
)


# ── WWW-Authenticate parsing ─────────────────────────────────────────────────


def test_parse_www_authenticate_quoted():
    header = 'Bearer resource_metadata="https://example.com/.well-known/oauth-protected-resource/mcp"'
    assert parse_www_authenticate(header) == (
        "https://example.com/.well-known/oauth-protected-resource/mcp"
    )


def test_parse_www_authenticate_unquoted_and_missing():
    assert parse_www_authenticate("Bearer resource_metadata=https://x.com/meta, charset=utf-8") == (
        "https://x.com/meta"
    )
    assert parse_www_authenticate("Bearer realm=x") is None
    assert parse_www_authenticate("") is None


# ── Tool risk classification ─────────────────────────────────────────────────


def test_tool_annotations_win_over_heuristics():
    # Server says read-only even though the name looks like a write.
    tool = MCPTool(name="execute_report", annotations={"readOnlyHint": True})
    assert tool.is_write is False

    # Server says destructive even though the name looks benign.
    tool = MCPTool(name="tidy", annotations={"destructiveHint": True})
    assert tool.is_destructive is True
    assert tool.is_write is True


def test_tool_heuristics_without_annotations():
    assert MCPTool(name="get_account_balance").is_write is False
    assert MCPTool(name="place_stock_order").is_write is True
    assert MCPTool(name="delete_repository").is_destructive is True
    assert MCPTool(name="transfer_funds").is_financial is True
    assert MCPTool(name="get_quotes", description="Fetch a trade quote").is_financial is True


def test_summarize_tools_counts():
    tools = [
        MCPTool(name="get_positions"),
        MCPTool(name="get_quotes"),
        MCPTool(name="place_order"),
        MCPTool(name="delete_watchlist"),
    ]
    summary = summarize_tools(tools)
    assert summary["total"] == 4
    assert summary["write"] == 2
    assert summary["read_only"] == 2
    assert summary["destructive"] == 1
    assert summary["financial"] >= 1


# ── Transport: JSON and SSE response shapes ──────────────────────────────────


def _mock_client(handler) -> httpx.AsyncClient:
    return httpx.AsyncClient(transport=httpx.MockTransport(handler))


def test_initialize_and_list_tools_json_response():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        if body["method"] == "initialize":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": body.get("id"),
                    "result": {
                        "protocolVersion": "2025-06-18",
                        "capabilities": {"tools": {}},
                        "serverInfo": {"name": "demo", "version": "1.2.3"},
                    },
                },
                headers={"mcp-session-id": "sess-1"},
            )
        if body["method"] == "tools/list":
            return httpx.Response(
                200,
                json={
                    "jsonrpc": "2.0",
                    "id": body.get("id"),
                    "result": {"tools": [{"name": "get_thing", "description": "reads"}]},
                },
            )
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body.get("id"), "result": {}})

    async def _run():
        client = MCPClient("https://example.com/mcp")
        async with _mock_client(handler) as http:
            info = await client.initialize(http)
            assert info.name == "demo"
            assert info.version == "1.2.3"
            assert client.session_id == "sess-1"

            tools = await client.list_tools(http)
            assert [t.name for t in tools] == ["get_thing"]

    asyncio.run(_run())


def test_sse_framed_response_is_parsed():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        payload = json.dumps({
            "jsonrpc": "2.0",
            "id": body.get("id"),
            "result": {"serverInfo": {"name": "sse-server", "version": "9"}},
        })
        return httpx.Response(
            200,
            text=f"event: message\ndata: {payload}\n\n",
            headers={"content-type": "text/event-stream"},
        )

    async def _run():
        client = MCPClient("https://example.com/mcp")
        async with _mock_client(handler) as http:
            info = await client.initialize(http)
        assert info.name == "sse-server"

    asyncio.run(_run())


def test_tools_list_pagination_follows_cursor():
    pages = {
        None: {"tools": [{"name": "a"}], "nextCursor": "p2"},
        "p2": {"tools": [{"name": "b"}]},
    }

    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        cursor = (body.get("params") or {}).get("cursor")
        return httpx.Response(
            200, json={"jsonrpc": "2.0", "id": body.get("id"), "result": pages[cursor]}
        )

    async def _run():
        client = MCPClient("https://example.com/mcp")
        async with _mock_client(handler) as http:
            tools = await client.list_tools(http)
        assert [t.name for t in tools] == ["a", "b"]

    asyncio.run(_run())


def test_401_raises_auth_required_with_metadata_url():
    def handler(request: httpx.Request) -> httpx.Response:
        return httpx.Response(
            401,
            text="authentication required",
            headers={"www-authenticate": 'Bearer resource_metadata="https://ex.com/meta"'},
        )

    async def _run():
        client = MCPClient("https://example.com/mcp")
        async with _mock_client(handler) as http:
            with pytest.raises(MCPAuthRequired) as excinfo:
                await client.initialize(http)
        assert excinfo.value.resource_metadata_url == "https://ex.com/meta"

    asyncio.run(_run())


def test_jsonrpc_error_becomes_mcp_error():
    def handler(request: httpx.Request) -> httpx.Response:
        body = json.loads(request.content)
        return httpx.Response(
            200,
            json={"jsonrpc": "2.0", "id": body.get("id"), "error": {"code": -32601, "message": "nope"}},
        )

    async def _run():
        client = MCPClient("https://example.com/mcp")
        async with _mock_client(handler) as http:
            with pytest.raises(MCPError, match="nope"):
                await client.initialize(http)

    asyncio.run(_run())


def test_bearer_token_is_sent():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["auth"] = request.headers.get("authorization")
        body = json.loads(request.content)
        return httpx.Response(200, json={"jsonrpc": "2.0", "id": body.get("id"), "result": {}})

    async def _run():
        client = MCPClient("https://example.com/mcp", access_token="tok-123")
        async with _mock_client(handler) as http:
            await client.initialize(http)
        assert seen["auth"] == "Bearer tok-123"

    asyncio.run(_run())


# ── OAuth: PKCE, discovery URL derivation, authorization URL ─────────────────


def test_generate_pkce_pair_is_valid_s256():
    verifier, challenge = mcp_oauth.generate_pkce_pair()
    expected = base64.urlsafe_b64encode(
        hashlib.sha256(verifier.encode("ascii")).digest()
    ).decode().rstrip("=")
    assert challenge == expected
    assert "=" not in challenge
    # RFC 7636 length bounds
    assert 43 <= len(verifier) <= 128


def test_well_known_candidates_follow_rfc8414_ordering():
    candidates = mcp_oauth._well_known_candidates(
        "https://agent.example.com/mcp/trading", "oauth-authorization-server"
    )
    # Spec form inserts the well-known segment before the path.
    assert candidates[0] == (
        "https://agent.example.com/.well-known/oauth-authorization-server/mcp/trading"
    )
    assert "https://agent.example.com/mcp/trading/.well-known/oauth-authorization-server" in candidates
    assert "https://agent.example.com/.well-known/oauth-authorization-server" in candidates


def test_build_authorization_url_includes_pkce_and_resource():
    metadata = mcp_oauth.AuthorizationServerMetadata(
        authorization_endpoint="https://idp.example.com/oauth",
        code_challenge_methods_supported=["S256"],
    )
    url = mcp_oauth.build_authorization_url(
        metadata,
        client_id="cid",
        redirect_uri="https://app.example.com/cb",
        state="st",
        code_challenge="chal",
        resource="https://agent.example.com/mcp/trading",
        scopes=["internal"],
    )
    assert url.startswith("https://idp.example.com/oauth?")
    assert "code_challenge=chal" in url
    assert "code_challenge_method=S256" in url
    assert "client_id=cid" in url
    assert "resource=https%3A%2F%2Fagent.example.com%2Fmcp%2Ftrading" in url
    assert "scope=internal" in url


def test_build_authorization_url_appends_to_existing_query():
    metadata = mcp_oauth.AuthorizationServerMetadata(
        authorization_endpoint="https://idp.example.com/oauth?tenant=acme",
    )
    url = mcp_oauth.build_authorization_url(
        metadata, "cid", "https://app/cb", "st", "chal", "https://res"
    )
    assert "https://idp.example.com/oauth?tenant=acme&" in url


def test_build_authorization_url_rejects_server_without_s256():
    metadata = mcp_oauth.AuthorizationServerMetadata(
        authorization_endpoint="https://idp.example.com/oauth",
        code_challenge_methods_supported=["plain"],
    )
    with pytest.raises(mcp_oauth.MCPOAuthError, match="PKCE S256"):
        mcp_oauth.build_authorization_url(
            metadata, "cid", "https://app/cb", "st", "chal", "https://res"
        )
