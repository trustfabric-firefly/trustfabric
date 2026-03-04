# yaml policy engine/validator

from __future__ import annotations

from functools import lru_cache
from pathlib import Path
from typing import Dict, List

import yaml
from pydantic import BaseModel, Field, ValidationError

from app.core.config import settings
from app.domain.models import PolicyKey, RiskTier


class PolicyConfigItem(BaseModel):
    key: PolicyKey = Field(..., description="Canonical policy key (must match PolicyKey enum)")
    description: str = Field(..., description="Human-readable policy description")
    risk_tiers: List[RiskTier] = Field(
        default_factory=list,
        description="Risk tiers this policy is required for",
    )


class PolicyConfig(BaseModel):
    policies: List[PolicyConfigItem]

    def by_risk_tier(self) -> Dict[RiskTier, List[PolicyKey]]:
        mapping: Dict[RiskTier, List[PolicyKey]] = {
            RiskTier.tier1: [],
            RiskTier.tier2: [],
            RiskTier.tier3: [],
        }
        for item in self.policies:
            for tier in item.risk_tiers:
                mapping[tier].append(item.key)
        return mapping


DEFAULT_POLICY_YAML = """
policies:
  - key: logging_required
    description: Basic logging of model invocations and key decisions is required.
    risk_tiers: ["Tier 1", "Tier 2", "Tier 3"]
  - key: human_review_required
    description: Human review is required before high-impact decisions are finalized.
    risk_tiers: ["Tier 2", "Tier 3"]
  - key: pii_restrictions
    description: Additional controls are required when handling personal or sensitive data.
    risk_tiers: ["Tier 3"]
""".strip()


@lru_cache(maxsize=1)
def load_policy_config(config_path: str | None = None) -> PolicyConfig:
    """
    Load and validate the policy configuration from YAML.

    - Parses YAML using PyYAML.
    - Validates structure and values with Pydantic.
    - Falls back to DEFAULT_POLICY_YAML if the file is missing or invalid.
    """
    raw_data: dict

    if config_path:
        path = Path(config_path)
        if path.is_file():
            try:
                raw_data = yaml.safe_load(path.read_text(encoding="utf-8")) or {}
            except yaml.YAMLError:
                # Fall back to default config on parse error.
                raw_data = yaml.safe_load(DEFAULT_POLICY_YAML)
        else:
            raw_data = yaml.safe_load(DEFAULT_POLICY_YAML)
    else:
        raw_data = yaml.safe_load(DEFAULT_POLICY_YAML)

    try:
        return PolicyConfig.model_validate(raw_data)
    except ValidationError:
        # If the user-provided YAML fails validation, use the safe default.
        return PolicyConfig.model_validate(yaml.safe_load(DEFAULT_POLICY_YAML))


def required_policies_for_risk(risk_tier: RiskTier | None, config_path: str | None = None) -> List[PolicyKey]:
    if risk_tier is None:
        return []
    # Use explicit path if provided, otherwise the global POLICIES_FILE setting.
    effective_path = config_path if config_path is not None else settings.policies_file
    config = load_policy_config(effective_path)
    mapping = config.by_risk_tier()
    return mapping.get(risk_tier, [])

