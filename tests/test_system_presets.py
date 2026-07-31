from datetime import datetime

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routes import systems as systems_routes
from app.core.security import Actor, Role, get_actor, require_admin
from app.domain.system_presets import (
    PRESET_SYSTEMS,
    get_presets_by_category,
    list_preset_categories,
)
from app.domain.models import AISystem, ModelType, DataSensitivity, OrgRole, RiskTier


def test_preset_definitions():
    assert len(PRESET_SYSTEMS) >= 15
    categories = list_preset_categories()
    cat_ids = [c["id"] for c in categories]
    assert "calculated_risk" in cat_ids
    assert "sisu_energy" in cat_ids
    assert "solaris_tech" in cat_ids
    assert "trellis_energy" in cat_ids
    assert "enterprise" in cat_ids


def test_get_presets_by_category():
    cr_presets = get_presets_by_category("calculated_risk")
    assert len(cr_presets) == 3
    assert any(p.name == "Econ-LLM Macro Analysis Assistant" for p in cr_presets)

    sisu_presets = get_presets_by_category("sisu_energy")
    assert len(sisu_presets) == 3
    assert any(p.name == "Automated Dispatch & Frac Sand Load Router" for p in sisu_presets)

    solaris_presets = get_presets_by_category("solaris_tech")
    assert len(solaris_presets) == 3
    assert any(p.name == "COW Power Management & Tri-Power Solar Switcher" for p in solaris_presets)

    trellis_presets = get_presets_by_category("trellis_energy")
    assert len(trellis_presets) == 3
    assert any(p.name == "Decline Curve & Reservoir Engineering AI Model" for p in trellis_presets)

    all_presets = get_presets_by_category("all")
    assert len(all_presets) == len(PRESET_SYSTEMS)


def test_preset_conversion_to_create_payload():
    preset = PRESET_SYSTEMS[0]
    payload = preset.to_create_payload()
    assert payload.name == preset.name
    assert payload.description == preset.description
    assert payload.owner == preset.owner
    assert payload.business_unit == preset.business_unit
    assert payload.model_type == preset.model_type
    assert payload.data_sensitivity == preset.data_sensitivity
    assert payload.risk_tier == preset.risk_tier
    assert payload.risk_justification == preset.risk_justification


def _admin_actor() -> Actor:
    return Actor(
        user_id="admin",
        organization_id="default",
        role=Role.admin,
        org_role=OrgRole.owner,
    )


class _FakeSystemStore:
    """Minimal in-memory stand-in for the Firestore-backed store."""

    def __init__(self) -> None:
        self.systems: list[AISystem] = []

    def list_systems(self, organization_id: str) -> list[AISystem]:
        return list(self.systems)

    def create_system(self, data, user_id: str, organization_id: str) -> AISystem:
        now = datetime.utcnow()
        system = AISystem(
            id=len(self.systems) + 1,
            organization_id=organization_id,
            created_at=now,
            updated_at=now,
            required_policies=[],
            missing_required_controls=False,
            **data.model_dump(),
        )
        self.systems.append(system)
        return system


@pytest.fixture
def seed_client(monkeypatch) -> tuple[TestClient, _FakeSystemStore]:
    fake_store = _FakeSystemStore()
    monkeypatch.setattr(systems_routes.store, "list_systems", fake_store.list_systems)
    monkeypatch.setattr(systems_routes.store, "create_system", fake_store.create_system)

    app = FastAPI()
    app.include_router(systems_routes.router, prefix="/api/v1/systems")
    app.dependency_overrides[get_actor] = _admin_actor
    app.dependency_overrides[require_admin] = _admin_actor
    return TestClient(app), fake_store


def test_presets_list_endpoint(seed_client):
    client, _ = seed_client
    res = client.get("/api/v1/systems/presets/list")
    assert res.status_code == 200
    body = res.json()
    assert body["total_presets"] == len(PRESET_SYSTEMS)
    assert len(body["categories"]) == 5


def test_seed_honours_requested_category(seed_client):
    """Regression: the JSON body must bind, so a single pack seeds only its own systems."""
    client, fake_store = seed_client
    res = client.post(
        "/api/v1/systems/presets/seed", json={"category_id": "calculated_risk"}
    )
    assert res.status_code == 200
    body = res.json()
    assert body["created"] == 3
    assert len(fake_store.systems) == 3
    assert all(s.name in body["systems_created"] for s in fake_store.systems)


def test_seed_all_and_dedupes_on_repeat(seed_client):
    client, fake_store = seed_client
    first = client.post("/api/v1/systems/presets/seed", json={"category_id": "all"})
    assert first.status_code == 200
    assert first.json()["created"] == len(PRESET_SYSTEMS)

    second = client.post("/api/v1/systems/presets/seed", json={"category_id": "all"})
    assert second.status_code == 200
    assert second.json()["created"] == 0
    assert len(fake_store.systems) == len(PRESET_SYSTEMS)


def test_seed_rejects_unknown_category(seed_client):
    client, fake_store = seed_client
    res = client.post("/api/v1/systems/presets/seed", json={"category_id": "bogus"})
    assert res.status_code == 400
    assert fake_store.systems == []


def test_seed_defaults_to_all_when_body_omitted(seed_client):
    client, fake_store = seed_client
    res = client.post("/api/v1/systems/presets/seed")
    assert res.status_code == 200
    assert res.json()["created"] == len(PRESET_SYSTEMS)
