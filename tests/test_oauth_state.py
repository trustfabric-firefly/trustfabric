from app.core.oauth_state import decode_oauth_state, encode_oauth_state


def test_oauth_state_round_trip():
    state = encode_oauth_state("user-1", "org-abc")
    user_id, organization_id = decode_oauth_state(state)
    assert user_id == "user-1"
    assert organization_id == "org-abc"
