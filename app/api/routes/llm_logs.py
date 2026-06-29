from __future__ import annotations

from datetime import datetime
from typing import List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query, status

from app.core.rate_limit import RateLimited, TIER_DEFAULT
from app.core.security import Actor, require_admin
from app.domain.models import LLMInteractionLog
from app.services.store import store

router = APIRouter()


@router.get(
    "/",
    response_model=List[LLMInteractionLog],
    summary="List LLM interaction logs (admin only)",
    dependencies=[Depends(RateLimited(TIER_DEFAULT))],
)
def list_llm_logs(
    system_id: Optional[int] = None,
    user_id: Optional[str] = None,
    model_name: Optional[str] = None,
    success: Optional[bool] = None,
    start: Optional[datetime] = Query(default=None),
    end: Optional[datetime] = Query(default=None),
    limit: int = Query(default=200, ge=1, le=500),
    actor: Actor = Depends(require_admin),
) -> List[LLMInteractionLog]:
    return store.list_llm_logs(
        actor.organization_id,
        system_id=system_id,
        user_id=user_id,
        model_name=model_name,
        success=success,
        start=start,
        end=end,
        limit=limit,
    )


@router.get(
    "/{log_id}",
    response_model=LLMInteractionLog,
    summary="Get one LLM interaction log (admin only)",
    dependencies=[Depends(RateLimited(TIER_DEFAULT))],
)
def get_llm_log(log_id: int, actor: Actor = Depends(require_admin)) -> LLMInteractionLog:
    log = store.get_llm_log(log_id, actor.organization_id)
    if log is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="LLM log not found")
    return log
