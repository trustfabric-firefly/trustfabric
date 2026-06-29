"""Webhook endpoint management."""

from __future__ import annotations

from typing import List

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.idempotency import (
    begin_idempotent_request,
    cached_idempotency_response,
    complete_idempotent_request,
    get_idempotency_key,
)
from app.core.security import Actor, require_admin
from app.domain.models import WebhookEndpointCreate, WebhookEndpointPublic, WebhookEndpointUpdate
from app.services.store import store
from app.services.webhooks import create_webhook, generate_webhook_secret, update_webhook

router = APIRouter()


class WebhookCreateResponse(BaseModel):
    webhook: WebhookEndpointPublic
    secret: str = Field(description="Plaintext signing secret — shown once at creation")


def _to_public(webhook) -> WebhookEndpointPublic:
    return WebhookEndpointPublic.model_validate(webhook.model_dump())


@router.get("/", response_model=List[WebhookEndpointPublic])
def list_webhooks(actor: Actor = Depends(require_admin)) -> List[WebhookEndpointPublic]:
    return [_to_public(w) for w in store.list_webhooks(actor.organization_id)]


@router.post("/", response_model=WebhookCreateResponse, status_code=status.HTTP_201_CREATED)
def create_webhook_endpoint(
    body: WebhookEndpointCreate,
    request: Request,
    actor: Actor = Depends(require_admin),
) -> WebhookCreateResponse | JSONResponse:
    idempotency_key = get_idempotency_key(request)
    key, cached = begin_idempotent_request(
        actor.organization_id,
        idempotency_key,
        method=request.method,
        path=str(request.url.path),
    )
    if cached:
        return cached_idempotency_response(cached)

    plain_secret = body.secret or generate_webhook_secret()
    create_body = body.model_copy(update={"secret": plain_secret})
    webhook = create_webhook(actor.organization_id, create_body)
    response = WebhookCreateResponse(webhook=_to_public(webhook), secret=plain_secret)
    complete_idempotent_request(
        actor.organization_id,
        key,
        status_code=status.HTTP_201_CREATED,
        response_body=response.model_dump(mode="json"),
        resource_id=webhook.webhook_id,
    )
    return response


@router.patch("/{webhook_id}", response_model=WebhookEndpointPublic)
def patch_webhook(
    webhook_id: str,
    body: WebhookEndpointUpdate,
    actor: Actor = Depends(require_admin),
) -> WebhookEndpointPublic:
    updated = update_webhook(webhook_id, actor.organization_id, body)
    if updated is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    return _to_public(updated)


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(webhook_id: str, actor: Actor = Depends(require_admin)) -> None:
    if not store.delete_webhook(webhook_id, actor.organization_id):
        raise HTTPException(status_code=404, detail="Webhook not found")
