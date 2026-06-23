from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Callable

from fastapi import Depends, HTTPException, Request, status

from app.core.config import settings
from app.core.security import Actor, get_actor

TIER_DEFAULT = "default"
TIER_EXPENSIVE = "expensive"
TIER_AUTH = "auth"


@dataclass
class _Bucket:
    tokens: float
    updated_at: float


class InMemoryRateLimiter:
    def __init__(self) -> None:
        self._buckets: dict[str, _Bucket] = {}

    def hit(self, key: str, limit_per_minute: int) -> None:
        now = time.monotonic()
        refill_rate_per_sec = limit_per_minute / 60.0
        bucket = self._buckets.get(key)
        if bucket is None:
            bucket = _Bucket(tokens=float(limit_per_minute), updated_at=now)
            self._buckets[key] = bucket

        elapsed = max(0.0, now - bucket.updated_at)
        bucket.tokens = min(float(limit_per_minute), bucket.tokens + elapsed * refill_rate_per_sec)
        bucket.updated_at = now

        if bucket.tokens < 1.0:
            retry_after = max(1, int(60 / max(limit_per_minute, 1)))
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests (rate limited)",
                headers={"Retry-After": str(retry_after)},
            )

        bucket.tokens -= 1.0


rate_limiter = InMemoryRateLimiter()


def _client_ip(request: Request) -> str:
    forwarded = request.headers.get("x-forwarded-for")
    if forwarded:
        return forwarded.split(",")[0].strip()
    return request.client.host if request.client else "unknown"


def _limit_for_tier(tier: str) -> int:
    if tier == TIER_EXPENSIVE:
        return settings.rate_limit_expensive_per_minute
    if tier == TIER_AUTH:
        return settings.rate_limit_auth_per_minute
    return settings.rate_limit_per_minute


def rate_limit(
    request: Request,
    *,
    tier: str = TIER_DEFAULT,
    actor_user_id: str | None = None,
    limit_per_minute: int | None = None,
) -> None:
    """Apply a token-bucket rate limit keyed by tier, client IP, and optional user."""
    subject = actor_user_id or "anon"
    key = f"{tier}:{_client_ip(request)}:{subject}"
    rate_limiter.hit(key=key, limit_per_minute=limit_per_minute or _limit_for_tier(tier))


def RateLimited(
    tier: str = TIER_DEFAULT,
    *,
    limit_per_minute: int | None = None,
) -> Callable[..., None]:
    """Dependency factory for authenticated routes."""

    def _dependency(request: Request, actor: Actor = Depends(get_actor)) -> None:
        rate_limit(
            request,
            tier=tier,
            actor_user_id=actor.user_id,
            limit_per_minute=limit_per_minute,
        )

    return _dependency


def RateLimitedPublic(
    tier: str = TIER_AUTH,
    *,
    limit_per_minute: int | None = None,
) -> Callable[..., None]:
    """Dependency factory for unauthenticated routes (IP scoped)."""

    def _dependency(request: Request) -> None:
        rate_limit(request, tier=tier, limit_per_minute=limit_per_minute)

    return _dependency
