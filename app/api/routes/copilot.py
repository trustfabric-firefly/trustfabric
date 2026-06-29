from __future__ import annotations

from typing import List

from pydantic import BaseModel, Field
from fastapi import APIRouter, Depends, HTTPException, status

from app.core.rate_limit import RateLimited, TIER_EXPENSIVE
from app.core.security import Actor, get_actor, require_operator
from app.domain.models import AIChatMessage, AIChatMessageCreate, AIChatMessageRole
from app.services.copilot import (
    generate_policy_recommendation,
    generate_recommendations_for_system,
)
from app.services.store import store

router = APIRouter()


class PolicyGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)
    history: list[str] = Field(default_factory=list)


def _history_lines(messages: list[AIChatMessage]) -> list[str]:
    return [f"{message.role.value}: {message.content}" for message in messages]


@router.post(
    "/systems/{system_id}/recommendations",
    summary="Generate NIST AI RMF-aligned governance recommendations for a system",
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
def generate_system_recommendations(
    system_id: int,
    actor: Actor = Depends(require_operator),
) -> dict:
    return generate_recommendations_for_system(
        system_id=system_id,
        user_id=actor.user_id,
        organization_id=actor.organization_id,
    )


@router.post(
    "/policies/recommendations",
    summary="Generate AI governance policy recommendations",
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
def generate_policy_with_provider(
    payload: PolicyGenerateRequest,
    actor: Actor = Depends(require_operator),
) -> dict:
    return generate_policy_recommendation(
        prompt=payload.prompt,
        user_id=actor.user_id,
        history=payload.history,
        organization_id=actor.organization_id,
    )


@router.get(
    "/systems/{system_id}/policy-chat",
    response_model=List[AIChatMessage],
    summary="List persisted AI policy chat history for a system",
)
def list_policy_chat_history(
    system_id: int,
    actor: Actor = Depends(get_actor),
) -> List[AIChatMessage]:
    messages = store.list_system_chat_messages(
        system_id=system_id,
        user_id=actor.user_id,
        organization_id=actor.organization_id,
    )
    if messages is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return messages


@router.post(
    "/systems/{system_id}/policy-chat/messages",
    response_model=AIChatMessage,
    status_code=status.HTTP_201_CREATED,
    summary="Persist a policy chat message for a system",
)
def create_policy_chat_message(
    system_id: int,
    payload: AIChatMessageCreate,
    actor: Actor = Depends(require_operator),
) -> AIChatMessage:
    created = store.create_system_chat_message(
        system_id=system_id,
        user_id=actor.user_id,
        data=payload,
        organization_id=actor.organization_id,
    )
    if created is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")
    return created


class PersistentPolicyGenerateRequest(BaseModel):
    prompt: str = Field(min_length=1, max_length=4000)


@router.post(
    "/systems/{system_id}/policy-chat/generate",
    summary="Generate a policy recommendation using persisted system chat history",
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
def generate_policy_for_system_chat(
    system_id: int,
    payload: PersistentPolicyGenerateRequest,
    actor: Actor = Depends(require_operator),
) -> dict:
    messages = store.list_system_chat_messages(
        system_id=system_id,
        user_id=actor.user_id,
        organization_id=actor.organization_id,
    )
    if messages is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    user_message = store.create_system_chat_message(
        system_id=system_id,
        user_id=actor.user_id,
        data=AIChatMessageCreate(role=AIChatMessageRole.user, content=payload.prompt),
        organization_id=actor.organization_id,
    )
    if user_message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    response = generate_policy_recommendation(
        prompt=payload.prompt,
        user_id=actor.user_id,
        history=_history_lines(messages),
        organization_id=actor.organization_id,
    )
    assistant_message = store.create_system_chat_message(
        system_id=system_id,
        user_id=actor.user_id,
        data=AIChatMessageCreate(
            role=AIChatMessageRole.ai,
            content=response.get("content", ""),
            policy=response.get("policy"),
            rules=response.get("rules"),
            provider=response.get("provider"),
            model=response.get("model"),
        ),
        organization_id=actor.organization_id,
    )
    if assistant_message is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="System not found")

    return {
        **response,
        "user_message": user_message,
        "assistant_message": assistant_message,
    }
