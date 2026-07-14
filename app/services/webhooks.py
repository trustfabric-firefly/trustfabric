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
from app.domain.models import (
    AuditEvent,
    AuditEventType,
    WebhookEndpoint,
    WebhookEndpointCreate,
    WebhookEndpointUpdate,
    WebhookEvent,
)
from app.services.store import store

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT_SECONDS = 10.0

_AUDIT_SEVERITY: dict[AuditEventType, str] = {
    AuditEventType.system_created: "info",
    AuditEventType.system_updated: "info",
    AuditEventType.system_deleted: "medium",
    AuditEventType.risk_tier_changed: "medium",
    AuditEventType.policy_mapping_changed: "info",
    AuditEventType.policy_created: "info",
    AuditEventType.policy_updated: "info",
    AuditEventType.member_invited: "info",
    AuditEventType.member_role_changed: "medium",
    AuditEventType.member_removed: "medium",
    AuditEventType.invite_revoked: "medium",
}

_AUDIT_CATEGORY: dict[AuditEventType, str] = {
    AuditEventType.system_created: "inventory",
    AuditEventType.system_updated: "inventory",
    AuditEventType.system_deleted: "inventory",
    AuditEventType.risk_tier_changed: "inventory",
    AuditEventType.policy_mapping_changed: "policy",
    AuditEventType.policy_created: "policy",
    AuditEventType.policy_updated: "policy",
    AuditEventType.member_invited: "identity",
    AuditEventType.member_role_changed: "identity",
    AuditEventType.member_removed: "identity",
    AuditEventType.invite_revoked: "identity",
}


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


def build_audit_siem_payload(audit: AuditEvent) -> dict[str, Any]:
    """Normalize an audit event into a SIEM-friendly webhook data payload."""
    event_type = audit.event_type
    return {
        "source": "trustfabric",
        "product": "TrustFabric",
        "audit_id": audit.id,
        "event_type": event_type.value,
        "category": _AUDIT_CATEGORY.get(event_type, "audit"),
        "severity": _AUDIT_SEVERITY.get(event_type, "info"),
        "actor_user_id": audit.user_id,
        "target_id": audit.target_id,
        "summary": audit.summary,
        "occurred_at": audit.timestamp.isoformat() + ("Z" if audit.timestamp.tzinfo is None else ""),
        "organization_id": audit.organization_id,
    }


def _sign_payload(secret: str, body: bytes, timestamp: str) -> str:
    message = f"{timestamp}.".encode() + body
    digest = hmac.new(secret.encode(), message, hashlib.sha256).hexdigest()
    return f"sha256={digest}"


def _build_envelope(
    organization_id: str,
    event: WebhookEvent,
    payload: dict[str, Any],
) -> tuple[bytes, str]:
    envelope = {
        "event": event.value,
        "timestamp": datetime.utcnow().isoformat() + "Z",
        "organization_id": organization_id,
        "data": payload,
    }
    body = json.dumps(envelope, default=str).encode()
    return body, envelope["timestamp"]


async def dispatch_webhook_event(
    organization_id: str,
    event: WebhookEvent,
    payload: dict[str, Any],
) -> None:
    endpoints = store.list_webhooks_for_event(organization_id, event.value)
    if not endpoints:
        return

    from app.core.secrets import decrypt_secret

    body, timestamp = _build_envelope(organization_id, event, payload)

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


def dispatch_webhook_event_sync(
    organization_id: str,
    event: WebhookEvent,
    payload: dict[str, Any],
) -> None:
    """Synchronous delivery for callers outside an async context (e.g. audit writes)."""
    endpoints = store.list_webhooks_for_event(organization_id, event.value)
    if not endpoints:
        return

    from app.core.secrets import decrypt_secret

    body, timestamp = _build_envelope(organization_id, event, payload)

    with httpx.Client(timeout=WEBHOOK_TIMEOUT_SECONDS) as client:
        for endpoint in endpoints:
            try:
                secret = decrypt_secret(endpoint.secret)
                signature = _sign_payload(secret, body, timestamp)
                response = client.post(
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


def export_audit_event(audit: AuditEvent) -> None:
    """Push a newly recorded audit event to SIEM subscribers (audit.created)."""
    try:
        dispatch_webhook_event_sync(
            audit.organization_id,
            WebhookEvent.audit_created,
            build_audit_siem_payload(audit),
        )
    except Exception:
        logger.exception(
            "Failed to export audit %s to webhooks for org %s",
            audit.id,
            audit.organization_id,
        )


def build_siem_test_payload(organization_id: str) -> dict[str, Any]:
    now = datetime.utcnow()
    sample = AuditEvent(
        id=0,
        organization_id=organization_id,
        event_type=AuditEventType.system_updated,
        target_id=None,
        user_id="siem-test",
        timestamp=now,
        summary="TrustFabric SIEM webhook test event",
    )
    payload = build_audit_siem_payload(sample)
    payload["test"] = True
    return payload
