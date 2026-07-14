"""Webhook endpoint management."""

from __future__ import annotations

from typing import List

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

from app.core.idempotency import (
    begin_idempotent_request,
    cached_idempotency_response,
    complete_idempotent_request,
    get_idempotency_key,
)
from app.core.secrets import decrypt_secret
from app.core.security import Actor, require_admin
from app.domain.models import (
    WebhookEndpointCreate,
    WebhookEndpointPublic,
    WebhookEndpointUpdate,
    WebhookEvent,
)
from app.services.store import store
from app.services.webhooks import (
    _build_envelope,
    _sign_payload,
    build_siem_test_payload,
    create_webhook,
    generate_webhook_secret,
    update_webhook,
)

router = APIRouter()


class WebhookCreateResponse(BaseModel):
    webhook: WebhookEndpointPublic
    secret: str = Field(description="Plaintext signing secret — shown once at creation")


def _to_public(webhook) -> WebhookEndpointPublic:
    return WebhookEndpointPublic.model_validate(webhook.model_dump())


@router.get("/", response_model=List[WebhookEndpointPublic])
def list_webhooks(actor: Actor = Depends(require_admin)) -> List[WebhookEndpointPublic]:
    return [_to_public(w) for w in store.list_webhooks(actor.organization_id)]


@router.get("/events", response_model=List[str], summary="List supported webhook event types")
def list_webhook_events(actor: Actor = Depends(require_admin)) -> List[str]:
    return [e.value for e in WebhookEvent]


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


@router.post("/{webhook_id}/test", summary="Send a sample SIEM/audit webhook payload")
def test_webhook(webhook_id: str, actor: Actor = Depends(require_admin)) -> dict:
    webhook = store.get_webhook(webhook_id, actor.organization_id)
    if webhook is None:
        raise HTTPException(status_code=404, detail="Webhook not found")
    if not webhook.enabled:
        raise HTTPException(status_code=400, detail="Webhook is disabled")

    event = (
        WebhookEvent.audit_created
        if WebhookEvent.audit_created in webhook.events
        else (webhook.events[0] if webhook.events else WebhookEvent.audit_created)
    )
    payload = build_siem_test_payload(actor.organization_id)
    body, timestamp = _build_envelope(actor.organization_id, event, payload)
    secret = decrypt_secret(webhook.secret)
    signature = _sign_payload(secret, body, timestamp)
    try:
        with httpx.Client(timeout=10.0) as client:
            response = client.post(
                webhook.url,
                content=body,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "TrustFabric-Webhooks/1.0",
                    "X-TrustFabric-Event": event.value,
                    "X-TrustFabric-Timestamp": timestamp,
                    "X-TrustFabric-Signature": signature,
                },
            )
        return {
            "ok": response.status_code < 400,
            "status_code": response.status_code,
            "event": event.value,
        }
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to reach webhook endpoint: {exc}",
        ) from exc


@router.delete("/{webhook_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_webhook(webhook_id: str, actor: Actor = Depends(require_admin)) -> None:
    if not store.delete_webhook(webhook_id, actor.organization_id):
        raise HTTPException(status_code=404, detail="Webhook not found")
