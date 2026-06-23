from __future__ import annotations

import pytest
from fastapi import HTTPException, Request
from starlette.datastructures import Headers

from app.core.rate_limit import InMemoryRateLimiter, rate_limit, TIER_DEFAULT


class _FakeClient:
    def __init__(self, host: str) -> None:
        self.host = host


def _request(ip: str = "203.0.113.10") -> Request:
    scope = {
        "type": "http",
        "method": "GET",
        "path": "/",
        "headers": Headers({}).raw,
        "client": (_FakeClient(ip).host, 12345),
    }
    return Request(scope)


def test_rate_limiter_allows_under_limit() -> None:
    limiter = InMemoryRateLimiter()
    for _ in range(3):
        limiter.hit("test-key", limit_per_minute=3)


def test_rate_limiter_blocks_over_limit() -> None:
    limiter = InMemoryRateLimiter()
    for _ in range(2):
        limiter.hit("test-key", limit_per_minute=2)
    with pytest.raises(HTTPException) as exc:
        limiter.hit("test-key", limit_per_minute=2)
    assert exc.value.status_code == 429
    assert exc.value.headers.get("Retry-After") == "30"


def test_rate_limit_scopes_by_user() -> None:
    request = _request()
    rate_limit(request, tier=TIER_DEFAULT, actor_user_id="user-a", limit_per_minute=1)
    rate_limit(request, tier=TIER_DEFAULT, actor_user_id="user-b", limit_per_minute=1)
    with pytest.raises(HTTPException):
        rate_limit(request, tier=TIER_DEFAULT, actor_user_id="user-a", limit_per_minute=1)
