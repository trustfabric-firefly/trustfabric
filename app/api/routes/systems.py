from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from app.core.idempotency import (
    begin_idempotent_request,
    cached_idempotency_response,
    complete_idempotent_request,
    get_idempotency_key,
)
from app.core.pagination import LimitQuery, OffsetQuery, PaginatedResponse, paginate
from app.core.rate_limit import RateLimited, TIER_EXPENSIVE
from app.core.security import Actor, get_actor, require_admin, require_operator
from app.domain.models import (
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    GovernancePolicy,
    GovernancePolicyCreate,
    GovernancePolicyUpdate,
)
from app.services import claude as claude_service
from app.services.copilot_quota import CopilotOperation, assert_copilot_allowed, record_copilot_usage
from app.services.notifications import notify_system_change
from app.services.store import store


class BulkImportRequest(BaseModel):
    systems: List[AISystemCreate]


class BulkImportResult(BaseModel):
    created: int
    errors: List[str]

router = APIRouter()


@router.get("/", response_model=PaginatedResponse[AISystem], summary="List AI systems")
def list_systems(
    actor: Actor = Depends(get_actor),
    limit: int = LimitQuery(),
    offset: int = OffsetQuery(),
) -> PaginatedResponse[AISystem]:
    return paginate(store.list_systems(actor.organization_id), limit=limit, offset=offset)


@router.post(
    "/",
    response_model=AISystem,
    status_code=status.HTTP_201_CREATED,
    summary="Create AI system (admin only)",
)
async def create_system(
    payload: AISystemCreate,
    request: Request,
    actor: Actor = Depends(require_admin),
) -> AISystem | JSONResponse:
    idempotency_key = get_idempotency_key(request)
    key, cached = begin_idempotent_request(
        actor.organization_id,
        idempotency_key,
        method=request.method,
        path=str(request.url.path),
    )
    if cached:
        return cached_idempotency_response(cached)

    system = store.create_system(payload, user_id=actor.user_id, organization_id=actor.organization_id)
    try:
        await notify_system_change(actor.organization_id, system, "created")
    except Exception:
        pass
    response_body = system.model_dump(mode="json")
    complete_idempotent_request(
        actor.organization_id,
        key,
        status_code=status.HTTP_201_CREATED,
        response_body=response_body,
        resource_id=str(system.id),
    )
    return system


@router.post(
    "/bulk",
    response_model=BulkImportResult,
    status_code=status.HTTP_200_OK,
    summary="Bulk import AI systems from CSV (admin only)",
)
async def bulk_import_systems(
    payload: BulkImportRequest,
    actor: Actor = Depends(require_admin),
) -> BulkImportResult:
    created = 0
    errors: List[str] = []
    for i, sys_create in enumerate(payload.systems):
        try:
            system = store.create_system(sys_create, user_id=actor.user_id, organization_id=actor.organization_id)
            try:
                await notify_system_change(actor.organization_id, system, "created")
            except Exception:
                pass
            created += 1
        except Exception as exc:
            errors.append(f"Row {i + 1} ({sys_create.name!r}): {exc}")
    return BulkImportResult(created=created, errors=errors)


@router.get(
    "/{system_id}/policies",
    response_model=List[GovernancePolicy],
    summary="List governance policies saved for a system",
)
def list_system_policies(system_id: int, actor: Actor = Depends(get_actor)) -> List[GovernancePolicy]:
    policies = store.list_system_policies(system_id, actor.organization_id)
    if policies is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return policies


@router.post(
    "/{system_id}/policies",
    response_model=GovernancePolicy,
    status_code=status.HTTP_201_CREATED,
    summary="Save a governance policy for a system (admin only)",
)
def create_system_policy(
    system_id: int,
    payload: GovernancePolicyCreate,
    actor: Actor = Depends(require_admin),
) -> GovernancePolicy:
    created = store.create_system_policy(
        system_id,
        payload,
        user_id=actor.user_id,
        organization_id=actor.organization_id,
    )
    if created is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return created


@router.patch(
    "/{system_id}/policies/{policy_id}",
    response_model=GovernancePolicy,
    summary="Update a governance policy (e.g. status) (admin only)",
)
def update_system_policy(
    system_id: int,
    policy_id: str,
    payload: GovernancePolicyUpdate,
    actor: Actor = Depends(require_admin),
) -> GovernancePolicy:
    updated = store.update_system_policy(
        system_id,
        policy_id,
        payload,
        user_id=actor.user_id,
        organization_id=actor.organization_id,
    )
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System or policy not found")
    return updated


@router.get("/{system_id}", response_model=AISystem, summary="Get AI system by ID")
def get_system(system_id: int, actor: Actor = Depends(get_actor)) -> AISystem:
    system = store.get_system(system_id, actor.organization_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return system


@router.patch("/{system_id}", response_model=AISystem, summary="Update AI system (admin only)")
async def update_system(system_id: int, payload: AISystemUpdate, actor: Actor = Depends(require_admin)) -> AISystem:
    system = store.update_system(
        system_id,
        payload,
        user_id=actor.user_id,
        organization_id=actor.organization_id,
    )
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    try:
        await notify_system_change(actor.organization_id, system, "updated")
    except Exception:
        pass
    return system


@router.delete(
    "/{system_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete AI system (admin only)",
)
async def delete_system(system_id: int, actor: Actor = Depends(require_admin)) -> None:
    system = store.get_system(system_id, actor.organization_id)
    deleted = store.delete_system(system_id, user_id=actor.user_id, organization_id=actor.organization_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    if system:
        try:
            await notify_system_change(actor.organization_id, system, "deleted")
        except Exception:
            pass


@router.post(
    "/{system_id}/explain-missing",
    summary="Ask Claude to explain missing required controls for a system",
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
def explain_missing(system_id: int, actor: Actor = Depends(require_operator)) -> dict:
    assert_copilot_allowed(actor.organization_id, actor.user_id)
    result = claude_service.explain_missing_controls(
        system_id=system_id,
        user_id=actor.user_id,
        organization_id=actor.organization_id,
    )
    record_copilot_usage(
        actor.organization_id,
        actor.user_id,
        CopilotOperation.explain_missing,
    )
    return result
