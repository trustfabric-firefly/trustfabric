import os

os.environ.setdefault("OAUTH_STATE_SECRET", "test-oauth-secret")
os.environ.setdefault("ADMIN_TOKEN", "test-admin")
os.environ.setdefault("API_BASE_URL", "http://localhost:8000")

import pytest
from fastapi import HTTPException

from app.domain.models import OrganizationSsoConfigUpdate, OrgRole
from app.services.sso import _normalize_domains, validate_sso_config_update


def test_normalize_domains():
    assert _normalize_domains([" Company.COM ", "@subsidiary.com"]) == ["company.com", "subsidiary.com"]


def test_validate_sso_requires_idp_fields_when_enabled():
    payload = OrganizationSsoConfigUpdate(enabled=True, email_domains=["acme.com"])
    with pytest.raises(HTTPException) as exc:
        validate_sso_config_update(payload)
    assert "incomplete" in str(exc.value.detail).lower()


def test_validate_sso_accepts_complete_config():
    payload = OrganizationSsoConfigUpdate(
        enabled=True,
        idp_entity_id="urn:test:idp",
        idp_sso_url="https://idp.example.com/sso",
        idp_x509_cert="MIIC...",
        email_domains=["acme.com"],
        default_role=OrgRole.viewer,
    )
    validated = validate_sso_config_update(payload)
    assert validated.email_domains == ["acme.com"]
