"""Governance policy catalog (risk-tier → required controls)."""

from __future__ import annotations

from typing import Dict, List

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app.core.config import settings
from app.core.rate_limit import RateLimited, TIER_DEFAULT
from app.core.security import Actor, get_actor
from app.domain.models import PolicyKey, RiskTier
from app.services.policies import load_policy_config

router = APIRouter()


class PolicyCatalogItem(BaseModel):
    key: PolicyKey
    description: str
    risk_tiers: List[RiskTier]


class PolicyCatalogResponse(BaseModel):
    policies: List[PolicyCatalogItem]
    by_risk_tier: Dict[RiskTier, List[PolicyKey]]


@router.get(
    "/catalog",
    response_model=PolicyCatalogResponse,
    summary="List governance policies and risk-tier mappings",
    dependencies=[Depends(RateLimited(TIER_DEFAULT))],
)
def get_policy_catalog(actor: Actor = Depends(get_actor)) -> PolicyCatalogResponse:
    _ = actor
    config = load_policy_config(settings.policies_file)
    return PolicyCatalogResponse(
        policies=[
            PolicyCatalogItem(
                key=item.key,
                description=item.description,
                risk_tiers=list(item.risk_tiers),
            )
            for item in config.policies
        ],
        by_risk_tier=config.by_risk_tier(),
    )
