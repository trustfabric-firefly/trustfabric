from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.security import Actor, get_actor
from app.domain.models import DashboardSummary
from app.services.store import store

router = APIRouter()


@router.get("/", response_model=DashboardSummary, summary="Governance dashboard summary")
def get_dashboard(actor: Actor = Depends(get_actor)) -> DashboardSummary:  # noqa: ARG001
    return store.dashboard_summary()

