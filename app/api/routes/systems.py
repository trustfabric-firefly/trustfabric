from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import Actor, get_actor, require_admin
from app.domain.models import (
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    GovernancePolicy,
    GovernancePolicyCreate,
    GovernancePolicyUpdate,
)
from app.services.store import store

router = APIRouter()


@router.get("/", response_model=List[AISystem], summary="List AI systems")
def list_systems(actor: Actor = Depends(get_actor)) -> List[AISystem]:  # noqa: ARG001 - actor for auth
    return store.list_systems()


@router.post(
    "/",
    response_model=AISystem,
    status_code=status.HTTP_201_CREATED,
    summary="Create AI system (admin only)",
)
def create_system(payload: AISystemCreate, actor: Actor = Depends(require_admin)) -> AISystem:
    return store.create_system(payload, user_id=actor.user_id)


@router.get(
    "/{system_id}/policies",
    response_model=List[GovernancePolicy],
    summary="List governance policies saved for a system",
)
def list_system_policies(system_id: int, actor: Actor = Depends(get_actor)) -> List[GovernancePolicy]:  # noqa: ARG001
    policies = store.list_system_policies(system_id)
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
    created = store.create_system_policy(system_id, payload, user_id=actor.user_id)
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
    updated = store.update_system_policy(system_id, policy_id, payload, user_id=actor.user_id)
    if updated is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System or policy not found")
    return updated


@router.get("/{system_id}", response_model=AISystem, summary="Get AI system by ID")
def get_system(system_id: int, actor: Actor = Depends(get_actor)) -> AISystem:  # noqa: ARG001 - actor for auth
    system = store.get_system(system_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return system


@router.patch("/{system_id}", response_model=AISystem, summary="Update AI system (admin only)")
def update_system(system_id: int, payload: AISystemUpdate, actor: Actor = Depends(require_admin)) -> AISystem:
    system = store.update_system(system_id, payload, user_id=actor.user_id)
    if system is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return system


@router.delete(
    "/{system_id}",
    status_code=status.HTTP_204_NO_CONTENT,
    summary="Delete AI system (admin only)",
)
def delete_system(system_id: int, actor: Actor = Depends(require_admin)) -> None:
    deleted = store.delete_system(system_id, user_id=actor.user_id)
    if not deleted:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

