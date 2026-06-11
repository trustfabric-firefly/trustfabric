from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.security import Actor, get_actor
from app.domain.models import DashboardSummary, NistCoverage
from app.services.store import store

router = APIRouter()


@router.get("/", response_model=DashboardSummary, summary="Governance dashboard summary")
def get_dashboard(actor: Actor = Depends(get_actor)) -> DashboardSummary:
    return store.dashboard_summary(actor.organization_id)


@router.get("/nist-coverage", response_model=NistCoverage, summary="NIST AI RMF control coverage")
def get_nist_coverage(actor: Actor = Depends(get_actor)) -> NistCoverage:
    return store.nist_coverage(actor.organization_id)
