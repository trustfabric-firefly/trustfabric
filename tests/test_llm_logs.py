from __future__ import annotations

from datetime import datetime
from unittest.mock import patch

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import llm_logs as llm_logs_routes
from app.core.security import Actor, Role, get_actor, require_admin
from app.domain.models import LLMInteractionLog, OrgRole


def _admin_actor() -> Actor:
    return Actor(
        user_id="admin",
        organization_id="default",
        role=Role.admin,
        org_role=OrgRole.owner,
    )


def _viewer_actor() -> Actor:
    return Actor(
        user_id="viewer",
        organization_id="default",
        role=Role.viewer,
        org_role=OrgRole.viewer,
    )


@pytest.fixture
def client() -> TestClient:
    app = FastAPI()
    app.include_router(llm_logs_routes.router, prefix="/api/v1/llm-logs")
    app.dependency_overrides[get_actor] = _admin_actor
    return TestClient(app)


@pytest.fixture
def viewer_client() -> TestClient:
    app = FastAPI()
    app.include_router(llm_logs_routes.router, prefix="/api/v1/llm-logs")
    app.dependency_overrides[get_actor] = _viewer_actor
    return TestClient(app)


def _sample_log(log_id: int = 1, org_id: str = "default") -> LLMInteractionLog:
    return LLMInteractionLog(
        id=log_id,
        organization_id=org_id,
        timestamp=datetime(2026, 6, 13, 12, 0, 0),
        user_id="admin",
        system_id=42,
        prompt_template_version="v1",
        input_summary="test prompt",
        model_name="claude-3-5-sonnet",
        response_summary="test response",
        success=True,
    )


def test_list_llm_logs_requires_admin(viewer_client: TestClient) -> None:
    with patch.object(llm_logs_routes.store, "list_llm_logs", return_value=[]):
        response = viewer_client.get("/api/v1/llm-logs/")
    assert response.status_code == 403


def test_list_llm_logs_returns_org_logs(client: TestClient) -> None:
    logs = [_sample_log(1), _sample_log(2)]
    with patch.object(llm_logs_routes.store, "list_llm_logs", return_value=logs) as list_fn:
        response = client.get(
            "/api/v1/llm-logs/",
            params={"system_id": 42, "success": True, "limit": 50},
        )
    assert response.status_code == 200
    data = response.json()
    assert len(data) == 2
    assert data[0]["model_name"] == "claude-3-5-sonnet"
    list_fn.assert_called_once_with(
        "default",
        system_id=42,
        user_id=None,
        model_name=None,
        success=True,
        start=None,
        end=None,
        limit=50,
    )


def test_get_llm_log_not_found(client: TestClient) -> None:
    with patch.object(llm_logs_routes.store, "get_llm_log", return_value=None):
        response = client.get("/api/v1/llm-logs/99")
    assert response.status_code == 404


def test_get_llm_log_success(client: TestClient) -> None:
    log = _sample_log(7)
    with patch.object(llm_logs_routes.store, "get_llm_log", return_value=log):
        response = client.get("/api/v1/llm-logs/7")
    assert response.status_code == 200
    assert response.json()["id"] == 7


def test_security_admin_can_list_logs() -> None:
    actor = Actor(
        user_id="u1",
        organization_id="org-1",
        role=Role.viewer,
        org_role=OrgRole.security_admin,
    )
    assert require_admin(actor) is actor
