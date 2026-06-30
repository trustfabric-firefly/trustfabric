from __future__ import annotations

import pytest
from pydantic import ValidationError

from app.domain.models import (
    AISystemCreate,
    DataSensitivity,
    ModelType,
    OrganizationCreate,
    OrganizationInviteCreate,
    OrganizationMemberUpdate,
    OrganizationSsoConfigUpdate,
    OrgRole,
    RiskTier,
    SystemStatus,
)


def test_invite_create_rejects_owner_role():
    with pytest.raises(ValidationError):
        OrganizationInviteCreate(email="a@acme.com", role=OrgRole.owner)


def test_invite_create_allows_viewer_default():
    invite = OrganizationInviteCreate(email="a@acme.com")
    assert invite.role == OrgRole.viewer


def test_invite_create_allows_admin():
    invite = OrganizationInviteCreate(email="a@acme.com", role=OrgRole.admin)
    assert invite.role == OrgRole.admin


def test_member_update_rejects_owner_assignment():
    with pytest.raises(ValidationError):
        OrganizationMemberUpdate(role=OrgRole.owner)


def test_member_update_allows_non_owner():
    update = OrganizationMemberUpdate(role=OrgRole.security_admin)
    assert update.role == OrgRole.security_admin


def test_sso_config_rejects_owner_default_role():
    with pytest.raises(ValidationError):
        OrganizationSsoConfigUpdate(default_role=OrgRole.owner)


def test_sso_config_accepts_viewer_default():
    cfg = OrganizationSsoConfigUpdate(default_role=OrgRole.viewer)
    assert cfg.default_role == OrgRole.viewer


def test_org_create_name_min_length():
    with pytest.raises(ValidationError):
        OrganizationCreate(name="a")


def test_org_create_name_max_length():
    with pytest.raises(ValidationError):
        OrganizationCreate(name="x" * 121)


def test_org_create_valid_name():
    org = OrganizationCreate(name="Acme Corp")
    assert org.name == "Acme Corp"


def test_system_create_defaults_status_draft():
    system = AISystemCreate(
        name="GitHub Copilot",
        description="Code assistant",
        owner="Platform",
        business_unit="Eng",
        model_type=ModelType.llm,
        data_sensitivity=DataSensitivity.medium,
    )
    assert system.status == SystemStatus.draft
    assert system.external_integrations == []
    assert system.risk_tier is None


def test_system_create_accepts_risk_tier():
    system = AISystemCreate(
        name="Fraud Model",
        description="Detects fraud",
        owner="Risk",
        business_unit="Finance",
        model_type=ModelType.ml,
        data_sensitivity=DataSensitivity.high,
        risk_tier=RiskTier.tier3,
        risk_justification="High impact financial decisions",
    )
    assert system.risk_tier == RiskTier.tier3


def test_system_create_invalid_model_type():
    with pytest.raises(ValidationError):
        AISystemCreate(
            name="X",
            description="d",
            owner="o",
            business_unit="b",
            model_type="NotAType",
            data_sensitivity=DataSensitivity.low,
        )


def test_sso_config_idp_url_max_length():
    with pytest.raises(ValidationError):
        OrganizationSsoConfigUpdate(idp_sso_url="https://" + "x" * 1100)
