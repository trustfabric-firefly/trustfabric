from __future__ import annotations

from pathlib import Path

import pytest

from app.domain.models import PolicyKey, RiskTier
from app.services.policies import (
    DEFAULT_POLICY_YAML,
    PolicyConfig,
    load_policy_config,
    required_policies_for_risk,
)


@pytest.fixture(autouse=True)
def _clear_policy_cache():
    load_policy_config.cache_clear()
    yield
    load_policy_config.cache_clear()


def test_default_config_maps_tiers_cumulatively():
    config = load_policy_config(None)
    mapping = config.by_risk_tier()

    # logging is required for every tier
    assert PolicyKey.logging_required in mapping[RiskTier.tier1]
    assert PolicyKey.logging_required in mapping[RiskTier.tier2]
    assert PolicyKey.logging_required in mapping[RiskTier.tier3]


def test_human_review_only_tier2_and_above():
    mapping = load_policy_config(None).by_risk_tier()
    assert PolicyKey.human_review_required not in mapping[RiskTier.tier1]
    assert PolicyKey.human_review_required in mapping[RiskTier.tier2]
    assert PolicyKey.human_review_required in mapping[RiskTier.tier3]


def test_pii_restrictions_tier3_only():
    mapping = load_policy_config(None).by_risk_tier()
    assert PolicyKey.pii_restrictions not in mapping[RiskTier.tier1]
    assert PolicyKey.pii_restrictions not in mapping[RiskTier.tier2]
    assert PolicyKey.pii_restrictions in mapping[RiskTier.tier3]


def test_required_policies_for_none_returns_empty():
    assert required_policies_for_risk(None) == []


def test_required_policies_for_tier1():
    keys = required_policies_for_risk(RiskTier.tier1, config_path=None)
    assert keys == [PolicyKey.logging_required]


def test_required_policies_for_tier3_has_all():
    keys = required_policies_for_risk(RiskTier.tier3, config_path=None)
    assert set(keys) == {
        PolicyKey.logging_required,
        PolicyKey.human_review_required,
        PolicyKey.pii_restrictions,
    }


def test_load_from_valid_file(tmp_path: Path):
    yaml_text = """
policies:
  - key: logging_required
    description: Custom logging
    risk_tiers: ["Tier 1"]
"""
    path = tmp_path / "policies.yaml"
    path.write_text(yaml_text, encoding="utf-8")
    config = load_policy_config(str(path))
    mapping = config.by_risk_tier()
    assert mapping[RiskTier.tier1] == [PolicyKey.logging_required]
    assert mapping[RiskTier.tier3] == []


def test_load_invalid_yaml_falls_back_to_default(tmp_path: Path):
    path = tmp_path / "broken.yaml"
    path.write_text("policies: [: : :", encoding="utf-8")
    config = load_policy_config(str(path))
    # Falls back to default which has pii_restrictions on tier3
    mapping = config.by_risk_tier()
    assert PolicyKey.pii_restrictions in mapping[RiskTier.tier3]


def test_load_schema_invalid_falls_back_to_default(tmp_path: Path):
    # Valid YAML but wrong shape (unknown policy key) should fall back
    path = tmp_path / "bad_schema.yaml"
    path.write_text(
        "policies:\n  - key: not_a_real_key\n    description: x\n    risk_tiers: []\n",
        encoding="utf-8",
    )
    config = load_policy_config(str(path))
    mapping = config.by_risk_tier()
    assert PolicyKey.logging_required in mapping[RiskTier.tier1]


def test_missing_file_uses_default():
    config = load_policy_config("/nonexistent/path/policies.yaml")
    assert isinstance(config, PolicyConfig)
    assert config.by_risk_tier()[RiskTier.tier1]


def test_default_yaml_constant_parses():
    import yaml

    data = yaml.safe_load(DEFAULT_POLICY_YAML)
    config = PolicyConfig.model_validate(data)
    assert len(config.policies) == 3
