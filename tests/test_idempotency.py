from __future__ import annotations

from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from app.core.idempotency import begin_idempotent_request, complete_idempotent_request
from app.domain.models import IdempotencyRecord, IdempotencyStatus


def test_begin_idempotent_request_returns_none_without_key():
    key, existing = begin_idempotent_request("org-1", None, method="POST", path="/api/v1/scans/")
    assert key is None
    assert existing is None


def test_begin_idempotent_request_creates_processing_record():
    mock_store = MagicMock()
    mock_store.get_idempotency.return_value = None
    with patch("app.core.idempotency.store", mock_store):
        key, existing = begin_idempotent_request(
            "org-1",
            "key-abc",
            method="POST",
            path="/api/v1/scans/",
        )
    assert key == "key-abc"
    assert existing is None
    mock_store.save_idempotency.assert_called_once()


def test_begin_idempotent_request_rejects_in_flight_duplicate():
    existing = IdempotencyRecord(
        key="key-abc",
        organization_id="org-1",
        method="POST",
        path="/api/v1/scans/",
        status=IdempotencyStatus.processing,
        status_code=202,
        response_body={},
        created_at=datetime.utcnow(),
        expires_at=datetime.utcnow() + timedelta(hours=24),
    )
    mock_store = MagicMock()
    mock_store.get_idempotency.return_value = existing
    with patch("app.core.idempotency.store", mock_store):
        with pytest.raises(HTTPException) as exc:
            begin_idempotent_request("org-1", "key-abc", method="POST", path="/api/v1/scans/")
    assert exc.value.status_code == 409


def test_complete_idempotent_request_updates_store():
    mock_store = MagicMock()
    with patch("app.core.idempotency.store", mock_store):
        complete_idempotent_request(
            "org-1",
            "key-abc",
            status_code=202,
            response_body={"scan_id": "scan-1"},
            resource_id="scan-1",
        )
    mock_store.complete_idempotency.assert_called_once()
