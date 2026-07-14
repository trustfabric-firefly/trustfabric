from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.pagination import LimitQuery, OffsetQuery, PaginatedResponse, paginate
from app.core.security import Actor, get_actor
from app.domain.models import AuditEvent
from app.services.store import store

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[AuditEvent], summary="List audit events")
def list_audit_events(
    actor: Actor = Depends(get_actor),
    limit: int = LimitQuery(),
    offset: int = OffsetQuery(),
) -> PaginatedResponse[AuditEvent]:
    return paginate(store.list_audits(actor.organization_id), limit=limit, offset=offset)
