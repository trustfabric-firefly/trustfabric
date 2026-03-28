from __future__ import annotations

from fastapi import APIRouter, Depends, Request

from app.core.rate_limit import rate_limit
from app.core.security import Actor, get_actor #auth model
from app.services.copilot import generate_recommendations_for_system

router = APIRouter()

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

