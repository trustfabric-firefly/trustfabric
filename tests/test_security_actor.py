from __future__ import annotations

from unittest.mock import patch

import pytest
from fastapi import HTTPException
from fastapi.security import HTTPAuthorizationCredentials

from app.core import security
from app.core.config import settings
from app.core.security import (
    Actor,
    Role,
    _map_org_role_to_api_role,
    get_actor,
    require_admin,
    require_operator,
)
from app.domain.models import OrgRole


def _creds(token: str, scheme: str = "Bearer") -> HTTPAuthorizationCredentials:
    return HTTPAuthorizationCredentials(scheme=scheme, credentials=token)


# --- role mapping -----------------------------------------------------------


@pytest.mark.parametrize(
    "org_role,expected",
    [
        (OrgRole.owner, Role.admin),
        (OrgRole.admin, Role.admin),
        (OrgRole.security_admin, Role.admin),
        (OrgRole.auditor, Role.viewer),
        (OrgRole.viewer, Role.viewer),
    ],
)
def test_map_org_role_to_api_role(org_role, expected):
    assert _map_org_role_to_api_role(org_role) == expected


# --- Actor.can_write --------------------------------------------------------


def test_actor_can_write_admin_role():
    actor = Actor("u", "org", Role.admin, OrgRole.viewer)
    assert actor.can_write is True


def test_actor_cannot_write_viewer():
    actor = Actor("u", "org", Role.viewer, OrgRole.viewer)
    assert actor.can_write is False


def test_actor_can_write_owner_org_role():
    actor = Actor("u", "org", Role.viewer, OrgRole.owner)
    assert actor.can_write is True


def test_actor_auditor_cannot_write():
    actor = Actor("u", "org", Role.viewer, OrgRole.auditor)
    assert actor.can_write is False


# --- require_admin ----------------------------------------------------------


def test_require_admin_allows_writer():
    actor = Actor("u", "org", Role.admin, OrgRole.admin)
    assert require_admin(actor) is actor


def test_require_admin_blocks_viewer():
    actor = Actor("u", "org", Role.viewer, OrgRole.viewer)
    with pytest.raises(HTTPException) as exc:
        require_admin(actor)
    assert exc.value.status_code == 403


def test_require_operator_allows_security_admin():
    actor = Actor("u", "org", Role.admin, OrgRole.security_admin)
    assert require_operator(actor) is actor


def test_require_operator_blocks_auditor():
    actor = Actor("u", "org", Role.viewer, OrgRole.auditor)
    with pytest.raises(HTTPException) as exc:
        require_operator(actor)
    assert exc.value.status_code == 403
    assert "security admin" in exc.value.detail.lower()


def test_require_operator_blocks_viewer():
    actor = Actor("u", "org", Role.viewer, OrgRole.viewer)
    with pytest.raises(HTTPException) as exc:
        require_operator(actor)
    assert exc.value.status_code == 403


# --- get_actor --------------------------------------------------------------


def test_get_actor_missing_credentials_raises_401():
    with pytest.raises(HTTPException) as exc:
        get_actor(creds=None, x_organization_id=None)
    assert exc.value.status_code == 401


def test_get_actor_wrong_scheme_raises_401():
    with pytest.raises(HTTPException) as exc:
        get_actor(creds=_creds("tok", scheme="Basic"), x_organization_id=None)
    assert exc.value.status_code == 401


def test_get_actor_admin_dev_token(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "admin_token", "secret-admin")
    monkeypatch.setattr(settings, "viewer_token", "secret-viewer")
    with patch.object(security, "ensure_dev_actor_membership", return_value="org-dev"):
        actor = get_actor(creds=_creds("secret-admin"), x_organization_id=None)
    assert actor.user_id == "admin"
    assert actor.role == Role.admin
    assert actor.org_role == OrgRole.owner
    assert actor.organization_id == "org-dev"


def test_get_actor_viewer_dev_token(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "admin_token", "secret-admin")
    monkeypatch.setattr(settings, "viewer_token", "secret-viewer")
    with patch.object(security, "ensure_dev_actor_membership", return_value="org-dev"):
        actor = get_actor(creds=_creds("secret-viewer"), x_organization_id=None)
    assert actor.user_id == "viewer"
    assert actor.role == Role.viewer
    assert actor.can_write is False


def test_get_actor_invalid_token_no_firebase_raises_401(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "admin_token", "secret-admin")
    monkeypatch.setattr(settings, "viewer_token", "secret-viewer")
    monkeypatch.setattr(settings, "firebase_project_id", "")
    with pytest.raises(HTTPException) as exc:
        get_actor(creds=_creds("not-a-real-token"), x_organization_id=None)
    assert exc.value.status_code == 401


def test_get_actor_firebase_claims_admin(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "development")
    monkeypatch.setattr(settings, "admin_token", "secret-admin")
    monkeypatch.setattr(settings, "firebase_project_id", "proj-1")
    claims = {"uid": "fb-user", "email": "a@acme.com", "role": "admin"}
    with patch.object(security, "verify_firebase_token", return_value=claims):
        with patch.object(
            security,
            "resolve_organization_for_actor",
            return_value=("org-fb", OrgRole.viewer),
        ):
            actor = get_actor(creds=_creds("fb-token"), x_organization_id="org-fb")
    assert actor.user_id == "fb-user"
    assert actor.email == "a@acme.com"
    # role claim "admin" overrides the viewer org role mapping
    assert actor.role == Role.admin
    assert actor.organization_id == "org-fb"


def test_get_actor_production_requires_firebase(monkeypatch):
    monkeypatch.setattr(settings, "app_env", "production")
    monkeypatch.setattr(settings, "admin_token", "secret-admin")
    monkeypatch.setattr(settings, "firebase_project_id", "")
    with pytest.raises(HTTPException) as exc:
        get_actor(creds=_creds("secret-admin"), x_organization_id=None)
    assert exc.value.status_code == 401
