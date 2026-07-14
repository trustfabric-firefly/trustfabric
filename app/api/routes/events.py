from __future__ import annotations

from datetime import datetime
from typing import Optional

from fastapi import APIRouter, Depends, Query

from app.core.pagination import LimitQuery, OffsetQuery, PaginatedResponse, paginate
from app.core.security import Actor, get_actor
from app.domain.models import ActivityEvent, ActivityEventCreate
from app.services.store import store

router = APIRouter()


@router.post(
    "/",
    response_model=ActivityEvent,
    summary="Ingest simulated activity event",
)
def create_event(payload: ActivityEventCreate, actor: Actor = Depends(get_actor)) -> ActivityEvent:
    return store.create_event(payload, organization_id=actor.organization_id)


@router.get(
    "/",
    response_model=PaginatedResponse[ActivityEvent],
    summary="List activity events",
)
def list_events(
    system_id: Optional[int] = None,
    event_type: Optional[str] = None,
    start: Optional[datetime] = Query(default=None),
    end: Optional[datetime] = Query(default=None),
    actor: Actor = Depends(get_actor),
    limit: int = LimitQuery(),
    offset: int = OffsetQuery(),
) -> PaginatedResponse[ActivityEvent]:
    events = store.list_events(
        organization_id=actor.organization_id,
        system_id=system_id,
        event_type=event_type,
        start=start,
        end=end,
    )
    return paginate(events, limit=limit, offset=offset)
