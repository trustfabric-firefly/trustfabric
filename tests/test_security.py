from app.core.security import Actor, Role, _map_org_role_to_api_role
from app.domain.models import OrgRole


def test_map_org_owner_to_admin():
    assert _map_org_role_to_api_role(OrgRole.owner) == Role.admin


def test_map_org_auditor_to_viewer():
    assert _map_org_role_to_api_role(OrgRole.auditor) == Role.viewer


def test_actor_can_write_for_security_admin():
    actor = Actor(
        user_id="u1",
        organization_id="org-1",
        role=Role.viewer,
        org_role=OrgRole.security_admin,
    )
    assert actor.can_write is True
