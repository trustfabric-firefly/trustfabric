"""Offset/limit pagination helpers for list endpoints."""

from __future__ import annotations

from typing import Generic, Sequence, TypeVar

from fastapi import Query
from pydantic import BaseModel, Field

T = TypeVar("T")

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class PaginatedResponse(BaseModel, Generic[T]):
    items: list[T]
    total: int = Field(ge=0)
    limit: int = Field(ge=1)
    offset: int = Field(ge=0)
    has_more: bool


def paginate(items: Sequence[T], *, limit: int, offset: int) -> PaginatedResponse[T]:
    total = len(items)
    safe_limit = max(1, min(limit, MAX_LIMIT))
    safe_offset = max(0, offset)
    page = list(items[safe_offset : safe_offset + safe_limit])
    return PaginatedResponse(
        items=page,
        total=total,
        limit=safe_limit,
        offset=safe_offset,
        has_more=safe_offset + len(page) < total,
    )


def LimitQuery(default: int = DEFAULT_LIMIT) -> int:
    return Query(default=default, ge=1, le=MAX_LIMIT, description="Page size")


def OffsetQuery(default: int = 0) -> int:
    return Query(default=default, ge=0, description="Number of items to skip")
