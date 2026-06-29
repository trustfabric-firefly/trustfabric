from __future__ import annotations

import asyncio
from datetime import datetime
from unittest.mock import AsyncMock, MagicMock, patch

from app.domain.models import WebhookEndpoint, WebhookEndpointCreate, WebhookEvent
from app.services.webhooks import create_webhook, dispatch_webhook_event


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
