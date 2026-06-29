from __future__ import annotations

import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime
from typing import Any
from uuid import uuid4

import httpx

from app.core.secrets import encrypt_secret
from app.domain.models import WebhookEndpoint, WebhookEndpointCreate, WebhookEndpointUpdate, WebhookEvent
from app.services.store import store

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT_SECONDS = 10.0


def generate_webhook_secret() -> str:
    return secrets.token_urlsafe(32)


def create_webhook(organization_id: str, body: WebhookEndpointCreate) -> WebhookEndpoint:
    now = datetime.utcnow()
    secret = body.secret or generate_webhook_secret()
    webhook = WebhookEndpoint(
        webhook_id=str(uuid4()),
        organization_id=organization_id,
        url=body.url.strip(),
        events=body.events or [WebhookEvent.scan_completed],
        secret=encrypt_secret(secret),
        enabled=body.enabled,
        created_at=now,
        updated_at=now,
    )
    store.save_webhook(webhook)
    return webhook


def update_webhook(
    webhook_id: str,
    organization_id: str,
    body: WebhookEndpointUpdate,
) -> WebhookEndpoint | None:
    existing = store.get_webhook(webhook_id, organization_id)
    if existing is None:
        return None
    updates: dict[str, Any] = {"updated_at": datetime.utcnow().isoformat()}
    if body.url is not None:
        updates["url"] = body.url.strip()
    if body.events is not None:
        updates["events"] = [e.value for e in body.events]
    if body.secret is not None:
        updates["secret"] = encrypt_secret(body.secret)
    if body.enabled is not None:
        updates["enabled"] = body.enabled
    store.update_webhook(webhook_id, organization_id, updates)
    return store.get_webhook(webhook_id, organization_id)


def _sign_payload(secret: str, body: bytes, timestamp: str) -> str:
    message = f"{timestamp}.".encode() + body
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


async def dispatch_webhook_event(
    organization_id: str,
    event: WebhookEvent,
    payload: dict[str, Any],
) -> None:
    endpoints = store.list_webhooks_for_event(organization_id, event.value)
    if not endpoints:
        return

    from app.core.secrets import decrypt_secret

    envelope = {
        "event": event.value,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "organization_id": organization_id,
        "data": payload,
    }
    body = json.dumps(envelope, default=str).encode()
    timestamp = envelope["timestamp"]

    async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_SECONDS) as client:
        for endpoint in endpoints:
            try:
                secret = decrypt_secret(endpoint.secret)
                signature = _sign_payload(secret, body, timestamp)
                response = await client.post(
                    endpoint.url,
                    content=body,
                    headers={
                        "Content-Type": "application/json",
                        "User-Agent": "TrustFabric-Webhooks/1.0",
                        "X-TrustFabric-Event": event.value,
                        "X-TrustFabric-Timestamp": timestamp,
                        "X-TrustFabric-Signature": signature,
                    },
                )
                if response.status_code >= 400:
                    logger.warning(
                        "Webhook %s returned %s for event %s",
                        endpoint.webhook_id,
                        response.status_code,
                        event.value,
                    )
            except Exception:
                logger.exception(
                    "Failed to deliver webhook %s for event %s",
                    endpoint.webhook_id,
                    event.value,
                )
