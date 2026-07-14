from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.domain.models import AuditEvent, AuditEventType, WebhookEndpoint, WebhookEndpointCreate, WebhookEvent
from app.services.webhooks import (
    build_audit_siem_payload,
    create_webhook,
    dispatch_webhook_event,
    dispatch_webhook_event_sync,
    export_audit_event,
)


def test_create_webhook_persists_endpoint():
    mock_store = MagicMock()
    body = WebhookEndpointCreate(
        url="https://example.com/hook",
        events=[WebhookEvent.scan_completed],
        secret="super-secret-key-123456",
    )
    with patch("app.services.webhooks.store", mock_store), patch(
        "app.services.webhooks.encrypt_secret",
        return_value="enc",
    ):
        webhook = create_webhook("org-1", body)
    assert webhook.organization_id == "org-1"
    assert webhook.url == "https://example.com/hook"
    mock_store.save_webhook.assert_called_once()


def test_build_audit_siem_payload_shape():
    audit = AuditEvent(
        id=42,
        organization_id="org-1",
        event_type=AuditEventType.member_role_changed,
        target_id=None,
        user_id="admin-1",
        timestamp=datetime(2026, 7, 10, 12, 0, 0),
        summary="Role changed to auditor",
    )
    payload = build_audit_siem_payload(audit)
    assert payload["source"] == "trustfabric"
    assert payload["audit_id"] == 42
    assert payload["event_type"] == "member_role_changed"
    assert payload["category"] == "identity"
    assert payload["severity"] == "medium"
    assert payload["actor_user_id"] == "admin-1"
    assert payload["summary"] == "Role changed to auditor"
    assert payload["occurred_at"].startswith("2026-07-10T12:00:00")


def test_export_audit_event_dispatches_audit_created():
    audit = AuditEvent(
        id=7,
        organization_id="org-1",
        event_type=AuditEventType.system_created,
        target_id=3,
        user_id="u1",
        timestamp=datetime.utcnow(),
        summary="Created system X",
    )
    with patch("app.services.webhooks.dispatch_webhook_event_sync") as dispatch:
        export_audit_event(audit)
    dispatch.assert_called_once()
    args = dispatch.call_args.args
    assert args[0] == "org-1"
    assert args[1] == WebhookEvent.audit_created
    assert args[2]["audit_id"] == 7
    assert args[2]["event_type"] == "system_created"
    assert args[2]["category"] == "inventory"


def test_dispatch_webhook_event_posts_signed_payload():
    async def _run():
        endpoint = WebhookEndpoint(
            webhook_id="wh-1",
            organization_id="org-1",
            url="https://example.com/hook",
            events=[WebhookEvent.scan_completed],
            secret="enc",
            enabled=True,
            created_at=datetime.utcnow(),
            updated_at=datetime.utcnow(),
        )
        mock_store = MagicMock()
        mock_store.list_webhooks_for_event.return_value = [endpoint]

        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_client = AsyncMock()
        mock_client.post = AsyncMock(return_value=mock_response)
        mock_client.__aenter__ = AsyncMock(return_value=mock_client)
        mock_client.__aexit__ = AsyncMock(return_value=None)

        with patch("app.services.webhooks.store", mock_store), patch(
            "app.core.secrets.decrypt_secret",
            return_value="plain-secret",
        ), patch("app.services.webhooks.httpx.AsyncClient", return_value=mock_client):
            await dispatch_webhook_event(
                "org-1",
                WebhookEvent.scan_completed,
                {"scan_id": "scan-1"},
            )

        mock_client.post.assert_called_once()
        headers = mock_client.post.call_args.kwargs["headers"]
        assert headers["X-TrustFabric-Event"] == "scan.completed"
        assert headers["X-TrustFabric-Signature"].startswith("sha256=")

    asyncio.run(_run())


def test_dispatch_webhook_event_sync_posts_audit_created():
    endpoint = WebhookEndpoint(
        webhook_id="wh-siem",
        organization_id="org-1",
        url="https://siem.example.com/ingest",
        events=[WebhookEvent.audit_created],
        secret="enc",
        enabled=True,
        created_at=datetime.utcnow(),
        updated_at=datetime.utcnow(),
    )
    mock_store = MagicMock()
    mock_store.list_webhooks_for_event.return_value = [endpoint]

    mock_response = MagicMock()
    mock_response.status_code = 202
    mock_client = MagicMock()
    mock_client.post.return_value = mock_response
    mock_client.__enter__ = MagicMock(return_value=mock_client)
    mock_client.__exit__ = MagicMock(return_value=False)

    with patch("app.services.webhooks.store", mock_store), patch(
        "app.core.secrets.decrypt_secret",
        return_value="plain-secret",
    ), patch("app.services.webhooks.httpx.Client", return_value=mock_client):
        dispatch_webhook_event_sync(
            "org-1",
            WebhookEvent.audit_created,
            {"audit_id": 1, "event_type": "system_created"},
        )

    mock_client.post.assert_called_once()
    headers = mock_client.post.call_args.kwargs["headers"]
    assert headers["X-TrustFabric-Event"] == "audit.created"
    body = mock_client.post.call_args.kwargs["content"]
    assert b'"event": "audit.created"' in body or b'"event":"audit.created"' in body
