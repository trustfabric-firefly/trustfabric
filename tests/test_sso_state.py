import os

os.environ.setdefault("OAUTH_STATE_SECRET", "test-oauth-secret")
os.environ.setdefault("ADMIN_TOKEN", "test-admin")

from app.core.sso_state import decode_sso_state, encode_sso_state


def test_sso_state_round_trip():
    state = encode_sso_state("org-acme", "/dashboard")
    org_id, return_to = decode_sso_state(state)
    assert org_id == "org-acme"
    assert return_to == "/dashboard"
