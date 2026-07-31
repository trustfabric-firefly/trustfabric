"""Universal Model Context Protocol (MCP) client.

Speaks the Streamable HTTP transport: JSON-RPC 2.0 over POST, where a server may
answer with either ``application/json`` or an SSE (``text/event-stream``) frame.
Real-world MCP servers vary, so both shapes are accepted.

Only read-only governance operations are implemented here — ``initialize`` and
``tools/list``. TrustFabric audits what a server *exposes*; it never invokes a
server's tools.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional, Tuple

import httpx

MCP_PROTOCOL_VERSION = "2025-06-18"
_CLIENT_NAME = "trustfabric-governance"
_CLIENT_VERSION = "1.0.0"
_DEFAULT_TIMEOUT = 20.0
_MAX_TOOL_PAGES = 20

# Substrings that suggest a tool mutates state or moves money/data. Used to flag
# write capability during an audit — advisory, not an enforcement boundary.
_WRITE_HINTS = (
    "create", "update", "delete", "remove", "write", "insert", "drop", "set_",
    "put", "post", "patch", "modify", "edit", "send", "publish", "deploy",
    "execute", "run", "invoke", "trigger", "cancel", "revoke", "grant",
)
_FINANCIAL_HINTS = (
    "order", "trade", "buy", "sell", "transfer", "withdraw", "deposit",
    "payment", "pay", "exercise", "swap", "convert",
)
_DESTRUCTIVE_HINTS = ("delete", "drop", "remove", "revoke", "destroy", "purge", "truncate")


class MCPError(RuntimeError):
    """An MCP transport, protocol, or server-side error."""


class MCPAuthRequired(MCPError):
    """Server demands OAuth. Carries whatever discovery metadata it advertised."""

    def __init__(self, message: str, resource_metadata_url: Optional[str] = None) -> None:
        super().__init__(message)
        self.resource_metadata_url = resource_metadata_url


@dataclass
class MCPTool:
    name: str
    description: str = ""
    input_schema: Dict[str, Any] = field(default_factory=dict)
    annotations: Dict[str, Any] = field(default_factory=dict)

    @property
    def is_write(self) -> bool:
        """True when the tool looks state-changing.

        Prefers the server's own ``readOnlyHint`` annotation when present, since
        that is authoritative; falls back to a name/description heuristic.
        """
        hint = self.annotations.get("readOnlyHint")
        if isinstance(hint, bool):
            return not hint
        destructive = self.annotations.get("destructiveHint")
        if isinstance(destructive, bool) and destructive:
            return True
        return _matches(self.name, _WRITE_HINTS) or _matches(self.name, _FINANCIAL_HINTS)

    @property
    def is_destructive(self) -> bool:
        hint = self.annotations.get("destructiveHint")
        if isinstance(hint, bool):
            return hint
        return _matches(self.name, _DESTRUCTIVE_HINTS)

    @property
    def is_financial(self) -> bool:
        return _matches(self.name, _FINANCIAL_HINTS) or _matches(self.description, _FINANCIAL_HINTS)

    def to_dict(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "description": self.description,
            "input_schema": self.input_schema,
            "annotations": self.annotations,
            "is_write": self.is_write,
            "is_destructive": self.is_destructive,
            "is_financial": self.is_financial,
        }


def _matches(text: str, hints: Tuple[str, ...]) -> bool:
    lowered = (text or "").lower()
    return any(hint in lowered for hint in hints)


@dataclass
class MCPServerInfo:
    name: str = ""
    version: str = ""
    protocol_version: str = ""
    capabilities: Dict[str, Any] = field(default_factory=dict)
    instructions: str = ""


def parse_www_authenticate(header: str) -> Optional[str]:
    """Pull ``resource_metadata`` out of a WWW-Authenticate challenge (RFC 9728)."""
    if not header:
        return None
    marker = "resource_metadata="
    idx = header.find(marker)
    if idx == -1:
        return None
    value = header[idx + len(marker):].strip()
    if value.startswith('"'):
        end = value.find('"', 1)
        return value[1:end] if end != -1 else value[1:]
    return value.split(",")[0].strip()


def _parse_rpc_payload(response: httpx.Response) -> Dict[str, Any]:
    """Decode a JSON-RPC reply sent as plain JSON or as an SSE frame."""
    content_type = response.headers.get("content-type", "")
    text = response.text

    if "text/event-stream" in content_type:
        for line in text.splitlines():
            line = line.strip()
            if not line.startswith("data:"):
                continue
            data = line[5:].strip()
            if not data or data == "[DONE]":
                continue
            try:
                parsed = json.loads(data)
            except json.JSONDecodeError:
                continue
            # Skip pings/notifications; we want the response carrying id/result.
            if isinstance(parsed, dict) and ("result" in parsed or "error" in parsed):
                return parsed
        raise MCPError("MCP server returned an event stream with no JSON-RPC response")

    try:
        return json.loads(text)
    except json.JSONDecodeError as exc:
        snippet = text[:200].replace("\n", " ")
        raise MCPError(f"MCP server returned non-JSON response: {snippet}") from exc


class MCPClient:
    """Minimal MCP client scoped to discovery and auditing."""

    def __init__(
        self,
        url: str,
        access_token: Optional[str] = None,
        timeout: float = _DEFAULT_TIMEOUT,
        extra_headers: Optional[Dict[str, str]] = None,
    ) -> None:
        self.url = url.strip()
        self.access_token = access_token
        self.timeout = timeout
        self.extra_headers = extra_headers or {}
        self.session_id: Optional[str] = None
        self._rpc_id = 0

    def _headers(self) -> Dict[str, str]:
        headers = {
            "Content-Type": "application/json",
            # Servers pick one; advertising both keeps non-conformant ones happy.
            "Accept": "application/json, text/event-stream",
            **self.extra_headers,
        }
        if self.access_token:
            headers["Authorization"] = f"Bearer {self.access_token}"
        if self.session_id:
            headers["Mcp-Session-Id"] = self.session_id
        return headers

    def _next_id(self) -> int:
        self._rpc_id += 1
        return self._rpc_id

    async def _rpc(
        self,
        client: httpx.AsyncClient,
        method: str,
        params: Optional[Dict[str, Any]] = None,
        notification: bool = False,
    ) -> Optional[Dict[str, Any]]:
        body: Dict[str, Any] = {"jsonrpc": "2.0", "method": method}
        if params is not None:
            body["params"] = params
        if not notification:
            body["id"] = self._next_id()

        try:
            response = await client.post(self.url, json=body, headers=self._headers())
        except httpx.TimeoutException as exc:
            raise MCPError(f"MCP server timed out after {self.timeout}s") from exc
        except httpx.RequestError as exc:
            raise MCPError(f"Could not reach MCP server: {exc}") from exc

        if response.status_code in (401, 403):
            raise MCPAuthRequired(
                "MCP server requires authorization",
                parse_www_authenticate(response.headers.get("www-authenticate", "")),
            )

        # Session id is issued on initialize and must be echoed on later calls.
        issued = response.headers.get("mcp-session-id")
        if issued:
            self.session_id = issued

        if notification:
            return None

        if response.status_code >= 400:
            snippet = response.text[:200].replace("\n", " ")
            raise MCPError(f"MCP server returned HTTP {response.status_code}: {snippet}")

        payload = _parse_rpc_payload(response)
        if "error" in payload:
            err = payload["error"] or {}
            raise MCPError(f"MCP error {err.get('code', '?')}: {err.get('message', 'unknown')}")
        return payload.get("result") or {}

    async def initialize(self, client: httpx.AsyncClient) -> MCPServerInfo:
        result = await self._rpc(
            client,
            "initialize",
            {
                "protocolVersion": MCP_PROTOCOL_VERSION,
                "capabilities": {},
                "clientInfo": {"name": _CLIENT_NAME, "version": _CLIENT_VERSION},
            },
        ) or {}

        server_info = result.get("serverInfo") or {}
        info = MCPServerInfo(
            name=str(server_info.get("name", "")),
            version=str(server_info.get("version", "")),
            protocol_version=str(result.get("protocolVersion", "")),
            capabilities=result.get("capabilities") or {},
            instructions=str(result.get("instructions", "")),
        )

        # Spec requires the initialized notification before normal operations.
        try:
            await self._rpc(client, "notifications/initialized", {}, notification=True)
        except MCPError:
            # Some servers close the notification channel; not fatal for listing.
            pass
        return info

    async def list_tools(self, client: httpx.AsyncClient) -> List[MCPTool]:
        tools: List[MCPTool] = []
        cursor: Optional[str] = None

        for _ in range(_MAX_TOOL_PAGES):
            params: Dict[str, Any] = {}
            if cursor:
                params["cursor"] = cursor
            result = await self._rpc(client, "tools/list", params) or {}

            for raw in result.get("tools") or []:
                if not isinstance(raw, dict):
                    continue
                tools.append(
                    MCPTool(
                        name=str(raw.get("name", "")),
                        description=str(raw.get("description", "") or ""),
                        input_schema=raw.get("inputSchema") or {},
                        annotations=raw.get("annotations") or {},
                    )
                )

            cursor = result.get("nextCursor")
            if not cursor:
                break

        return tools

    async def probe(self) -> Tuple[MCPServerInfo, List[MCPTool]]:
        """Full read-only audit pass: handshake, then enumerate tools."""
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=True) as client:
            info = await self.initialize(client)
            tools: List[MCPTool] = []
            # A server without tools capability is valid; listing would error.
            if info.capabilities.get("tools") is not None or not info.capabilities:
                try:
                    tools = await self.list_tools(client)
                except MCPError:
                    tools = []
            return info, tools


def summarize_tools(tools: List[MCPTool]) -> Dict[str, int]:
    """Governance counters shown on the MCP registry card."""
    return {
        "total": len(tools),
        "read_only": sum(1 for t in tools if not t.is_write),
        "write": sum(1 for t in tools if t.is_write),
        "destructive": sum(1 for t in tools if t.is_destructive),
        "financial": sum(1 for t in tools if t.is_financial),
    }
