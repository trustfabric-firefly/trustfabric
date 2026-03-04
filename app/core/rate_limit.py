from __future__ import annotations

import time
from dataclasses import dataclass

from fastapi import HTTPException, Request, status

from app.core.config import settings


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
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail="Too many requests (rate limited)",
            )

        bucket.tokens -= 1.0


rate_limiter = InMemoryRateLimiter()


def rate_limit(request: Request) -> None:
    key = request.client.host if request.client else "unknown"
    rate_limiter.hit(key=key, limit_per_minute=settings.rate_limit_per_minute)
