"""Substack publication integration.

Substack publishes no documented authenticated API, so there is no endpoint
against which a publication key can be verified. What *is* verifiable is the
publication itself, via its public JSON feed.

This module therefore validates the publication URL and stores the supplied
secret for use by the publishing-audit workflow. The secret is deliberately
**not** described as "validated" anywhere in the UI, because it cannot be.
"""

from __future__ import annotations

from typing import Any, Dict
from urllib.parse import urlparse, urlunparse

import httpx

_TIMEOUT = 15.0


class SubstackError(RuntimeError):
    """The publication could not be reached or is not a Substack publication."""


def normalize_publication_url(url: str) -> str:
    candidate = url.strip().rstrip("/")
    if not candidate:
        raise SubstackError("Publication URL is required")
    if not candidate.startswith(("http://", "https://")):
        candidate = f"https://{candidate}"
    parsed = urlparse(candidate)
    if not parsed.netloc:
        raise SubstackError(f"Could not parse publication URL: {url}")
    return urlunparse(("https", parsed.netloc, "", "", "", ""))


async def verify_publication(publication_url: str) -> Dict[str, Any]:
    """Confirm the URL resolves to a real Substack publication.

    Returns a small descriptor of the publication. Raises SubstackError when the
    endpoint is unreachable or does not expose the Substack post feed.
    """
    base = normalize_publication_url(publication_url)
    feed_url = f"{base}/api/v1/posts?limit=1"

    try:
        async with httpx.AsyncClient(timeout=_TIMEOUT, follow_redirects=True) as client:
            response = await client.get(feed_url, headers={"Accept": "application/json"})
    except httpx.TimeoutException as exc:
        raise SubstackError(f"Publication timed out after {_TIMEOUT}s") from exc
    except httpx.RequestError as exc:
        raise SubstackError(f"Could not reach {base}: {exc}") from exc

    if response.status_code >= 400:
        raise SubstackError(
            f"{base} did not respond to the Substack post feed (HTTP {response.status_code}). "
            "Check that this is a Substack publication URL."
        )

    try:
        payload = response.json()
    except ValueError as exc:
        raise SubstackError(f"{base} did not return a Substack JSON feed") from exc

    if not isinstance(payload, list):
        raise SubstackError(f"{base} did not return a Substack post feed")

    latest = payload[0] if payload and isinstance(payload[0], dict) else {}
    return {
        "publication_url": base,
        "latest_post_title": str(latest.get("title", "")),
        "latest_post_at": str(latest.get("post_date", "")),
    }
