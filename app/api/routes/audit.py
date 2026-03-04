from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends

from app.core.security import Actor, get_actor
from app.domain.models import AuditEvent
from app.services.store import store

router = APIRouter()


@router.get("/", response_model=List[AuditEvent], summary="List audit events")
def list_audit_events(actor: Actor = Depends(get_actor)) -> List[AuditEvent]:  # noqa: ARG001
    return store.list_audits()

