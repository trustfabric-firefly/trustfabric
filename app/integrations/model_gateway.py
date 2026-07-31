"""OpenAI-compatible model gateway integration.

Works against any endpoint implementing the OpenAI REST surface (OpenAI itself,
Azure OpenAI gateways, vLLM, LiteLLM, OpenRouter, ...). Validation is a real
authenticated call to ``GET /models``.
"""

from __future__ import annotations

from typing import Any, Dict, List

import httpx

_TIMEOUT = 15.0


class ModelGatewayError(RuntimeError):
    """The gateway rejected the credentials or could not be reached."""


def _models_url(endpoint: str) -> str:
    base = endpoint.rstrip("/")
    # Accept both ".../v1" and a bare host; do not double the version segment.
    if base.endswith("/models"):
        return base
    return f"{base}/models"


async def verify_gateway(endpoint: str, api_key: str) -> List[str]:
    """Authenticate against the gateway and return the model ids it exposes."""
    url = _models_url(endpoint)
    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            response = await client.get(
                url,
                headers={
                    "Authorization": f"Bearer {api_key}",
                    "Accept": "application/json",
                },
            )
    except httpx.TimeoutException as exc:
        raise ModelGatewayError(f"Gateway timed out after {_TIMEOUT}s") from exc
    except httpx.RequestError as exc:
        raise ModelGatewayError(f"Could not reach gateway at {url}: {exc}") from exc

    if response.status_code in (401, 403):
        raise ModelGatewayError("Gateway rejected the API key (unauthorized)")
    if response.status_code >= 400:
        snippet = response.text[:200].replace("\n", " ")
        raise ModelGatewayError(f"Gateway returned HTTP {response.status_code}: {snippet}")

    try:
        payload: Dict[str, Any] = response.json()
    except ValueError as exc:
        raise ModelGatewayError("Gateway returned a non-JSON response") from exc

    data = payload.get("data")
    if not isinstance(data, list):
        raise ModelGatewayError("Gateway response did not contain a model list")

    return [str(item.get("id", "")) for item in data if isinstance(item, dict) and item.get("id")]
