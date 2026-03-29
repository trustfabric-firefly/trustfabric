from __future__ import annotations

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, Request

from app.core.rate_limit import rate_limit
from app.core.security import Actor, get_actor  # auth model
from app.services.claude import generate_policy_recommendation
from app.services.copilot import generate_recommendations_for_system

router = APIRouter()


class PolicyGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    history: list[str] = Field(default_factory=list)

# post endpoint for generating recommendations
@router.post(
    "/systems/{system_id}/recommendations",
    summary="Generate NIST AI RMF-aligned governance recommendations for a system",
)

# returns dict, FastAPI will parse it to JSON
# includes raw Claude output, disclaimer, and NIST function hints
def generate_system_recommendations(
    system_id: int,
    request: Request,
    actor: Actor = Depends(get_actor),
) -> dict:  # noqa: D417
    rate_limit(request)
    return generate_recommendations_for_system(system_id=system_id, user_id=actor.user_id)


@router.post(
    "/policies/recommendations",
    summary="Generate AI governance policy recommendations",
)
def generate_policy_with_claude(
    payload: PolicyGenerateRequest,
    request: Request,
    actor: Actor = Depends(get_actor),
) -> dict:
    rate_limit(request)
    return generate_policy_recommendation(
        prompt=payload.prompt,
        user_id=actor.user_id,
        history=payload.history,
    )

