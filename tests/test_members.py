from app.domain.models import OrgRole
from app.services.members import (
    _invitable_roles,
    _manageable_roles,
    normalize_email,
)


def test_normalize_email():
    assert normalize_email("  User@Company.COM ") == "user@company.com"


def test_owner_can_invite_admin_roles():
    roles = _invitable_roles(OrgRole.owner)
    assert OrgRole.admin in roles
    assert OrgRole.viewer in roles
    assert OrgRole.owner not in roles


def test_security_admin_invite_scope():
    roles = _invitable_roles(OrgRole.security_admin)
    assert roles == {OrgRole.auditor, OrgRole.viewer}


def test_admin_can_manage_non_owner_roles():
    manageable = _manageable_roles(OrgRole.admin)
    assert OrgRole.owner not in manageable
    assert OrgRole.admin in manageable
    assert OrgRole.viewer in manageable


def test_security_admin_manage_scope():
    manageable = _manageable_roles(OrgRole.security_admin)
    assert manageable == {OrgRole.auditor, OrgRole.viewer}
