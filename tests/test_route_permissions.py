from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import Depends, FastAPI
from fastapi.testclient import TestClient

from app.core.security import Actor, Role, get_actor, require_operator
from app.domain.models import OrgRole


def _viewer() -> Actor:
    return Actor(
        user_id="viewer",
        organization_id="org-1",
        role=Role.viewer,
        org_role=OrgRole.viewer,
    )


def _security_admin() -> Actor:
    return Actor(
        user_id="sec-admin",
        organization_id="org-1",
        role=Role.admin,
        org_role=OrgRole.security_admin,
    )


@pytest.fixture
def viewer_client() -> TestClient:
    app = FastAPI()

    @app.post("/protected")
    def protected(actor: Actor = Depends(require_operator)) -> dict:
        return {"ok": True}

    app.dependency_overrides[get_actor] = _viewer
    return TestClient(app)


@pytest.fixture
def operator_client() -> TestClient:
    app = FastAPI()

    @app.post("/protected")
    def protected(actor: Actor = Depends(require_operator)) -> dict:
        return {"ok": True}

    app.dependency_overrides[get_actor] = _security_admin
    return TestClient(app)


def test_viewer_blocked_from_operator_route(viewer_client: TestClient) -> None:
    response = viewer_client.post("/protected")
    assert response.status_code == 403


def test_security_admin_allowed_on_operator_route(operator_client: TestClient) -> None:
    response = operator_client.post("/protected")
    assert response.status_code == 200


def test_copilot_recommendations_require_operator() -> None:
    from app.api.routes import copilot as copilot_routes

    app = FastAPI()
    app.include_router(copilot_routes.router, prefix="/api/v1/copilot")
    app.dependency_overrides[get_actor] = _viewer

    with patch(
        "app.services.copilot.generate_recommendations_for_system",
        return_value={"summary": "ok"},
    ):
        client = TestClient(app)
        response = client.post("/api/v1/copilot/systems/1/recommendations")

    assert response.status_code == 403
