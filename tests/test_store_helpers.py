from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.core import secrets
from app.core.config import settings
from app.domain.models import (
    GovernancePolicySeverity,
    ScanConfig,
)
from app.services.store import FirestoreStore


@pytest.fixture(autouse=True)
def _encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "encryption_key", "store-helpers-test-key")
    monkeypatch.setattr(settings, "oauth_state_secret", "")
    monkeypatch.setattr(settings, "admin_token", "")


# --- _matches_org -----------------------------------------------------------


def test_matches_org_explicit_match():
    assert FirestoreStore._matches_org({"organization_id": "org-1"}, "org-1") is True


def test_matches_org_explicit_mismatch():
    assert FirestoreStore._matches_org({"organization_id": "org-1"}, "org-2") is False


def test_matches_org_missing_field_matches_default(monkeypatch):
    monkeypatch.setattr(settings, "default_organization_id", "default")
    assert FirestoreStore._matches_org({}, "default") is True
    assert FirestoreStore._matches_org({}, "other-org") is False


# --- _serialize -------------------------------------------------------------


def test_serialize_uses_json_mode():
    cfg = ScanConfig(scope="repositories", github_org="acme", policies_checked=["chk_a"])
    out = FirestoreStore._serialize(cfg)
    assert out == {
        "scope": "repositories",
        "github_org": "acme",
        "policies_checked": ["chk_a"],
    }


# --- _coerce_policy_datetime ------------------------------------------------


def test_coerce_datetime_passthrough():
    dt = datetime(2026, 1, 1, 12, 0)
    assert FirestoreStore._coerce_policy_datetime(dt) is dt


def test_coerce_datetime_from_iso_string():
    out = FirestoreStore._coerce_policy_datetime("2026-06-13T10:30:00")
    assert out == datetime(2026, 6, 13, 10, 30, 0)


def test_coerce_datetime_from_z_string_strips_tz():
    out = FirestoreStore._coerce_policy_datetime("2026-06-13T10:30:00Z")
    assert out.tzinfo is None
    assert out == datetime(2026, 6, 13, 10, 30, 0)


def test_coerce_datetime_from_timestamp_object():
    class _FakeTs:
        def timestamp(self):
            return datetime(2026, 6, 13, tzinfo=timezone.utc).timestamp()

    out = FirestoreStore._coerce_policy_datetime(_FakeTs())
    assert isinstance(out, datetime)


def test_coerce_datetime_invalid_raises():
    with pytest.raises(ValueError):
        FirestoreStore._coerce_policy_datetime(12345)


# --- _normalize_policy_payload ----------------------------------------------


def test_normalize_policy_payload_coerces_both_timestamps():
    store = FirestoreStore()
    payload = {
        "name": "x",
        "created_at": "2026-06-13T00:00:00Z",
        "updated_at": "2026-06-14T00:00:00",
    }
    out = store._normalize_policy_payload(payload)
    assert isinstance(out["created_at"], datetime)
    assert isinstance(out["updated_at"], datetime)
    assert out["name"] == "x"


def test_normalize_policy_payload_skips_none_timestamps():
    store = FirestoreStore()
    out = store._normalize_policy_payload({"created_at": None, "updated_at": None})
    assert out["created_at"] is None
    assert out["updated_at"] is None


# --- integration field encryption -------------------------------------------


def test_encrypt_integration_fields_handles_empty_values():
    out = FirestoreStore._encrypt_integration_fields({"github_access_token": ""})
    assert out["github_access_token"] == ""


def test_decrypt_integration_fields_roundtrip():
    plain = "ghp_secret_value"
    encrypted = FirestoreStore._encrypt_integration_fields({"github_access_token": plain})
    decrypted = FirestoreStore._decrypt_integration_fields(encrypted)
    assert decrypted["github_access_token"] == plain


def test_encrypt_integration_fields_does_not_mutate_input():
    doc = {"figma_access_token": "figd_plain"}
    FirestoreStore._encrypt_integration_fields(doc)
    assert doc["figma_access_token"] == "figd_plain"  # original untouched


# --- default scan policies --------------------------------------------------


def test_default_scan_policies_have_required_shape():
    defaults = FirestoreStore._DEFAULT_SCAN_POLICIES
    assert len(defaults) >= 6
    check_ids = {p["check_id"] for p in defaults}
    assert "chk_branch_protection" in check_ids
    for p in defaults:
        assert p["tier"] in ("personal", "enterprise")
        # severity must be a valid enum value
        GovernancePolicySeverity(p["severity"])
