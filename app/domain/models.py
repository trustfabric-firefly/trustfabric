# pydantic models for systems, events, audits, risk tiers, policies, LLM logs

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field


class ModelType(str, Enum):
    llm = "LLM"
    ml = "ML"
    agent = "Agent"
    other = "Other"


class DataSensitivity(str, Enum):
    low = "Low"
    medium = "Medium"
    high = "High"


class SystemStatus(str, Enum):
    draft = "Draft"
    active = "Active"
    retired = "Retired"


class RiskTier(str, Enum):
    tier1 = "Tier 1"
    tier2 = "Tier 2"
    tier3 = "Tier 3"


class PolicyKey(str, Enum):
    logging_required = "logging_required"
    human_review_required = "human_review_required"
    pii_restrictions = "pii_restrictions"


class AISystemBase(BaseModel):
    name: str = Field(..., description="System name (e.g., GitHub)")
    description: str = Field(..., description="System description")
    owner: str = Field(..., description="Owner name or identifier")
    business_unit: str = Field(..., description="Business unit or team")
    model_type: ModelType = Field(..., description="Type of AI model")
    data_sensitivity: DataSensitivity = Field(..., description="Data sensitivity classification")
    external_integrations: List[str] = Field(default_factory=list, description="External integrations (tags)")
    status: SystemStatus = Field(default=SystemStatus.draft, description="Lifecycle status")


class AISystemCreate(AISystemBase):
    risk_tier: Optional[RiskTier] = Field(default=None, description="Optional initial risk tier")
    risk_justification: Optional[str] = Field(default=None, description="Justification for risk tier")


class AISystemUpdate(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    owner: Optional[str] = None
    business_unit: Optional[str] = None
    model_type: Optional[ModelType] = None
    data_sensitivity: Optional[DataSensitivity] = None
    external_integrations: Optional[List[str]] = None
    status: Optional[SystemStatus] = None
    risk_tier: Optional[RiskTier] = None
    risk_justification: Optional[str] = None


class AISystem(AISystemBase):
    id: int
    created_at: datetime
    updated_at: datetime
    risk_tier: Optional[RiskTier] = None
    risk_justification: Optional[str] = None
    required_policies: List[PolicyKey] = Field(default_factory=list)
    missing_required_controls: bool = False


class RiskTierChange(BaseModel):
    system_id: int
    old_tier: Optional[RiskTier]
    new_tier: RiskTier
    justification: str
    changed_at: datetime
    changed_by: str


class ActivityEventCreate(BaseModel):
    system_id: int
    timestamp: datetime
    user_id: str
    event_type: str
    metadata: Dict[str, Any] = Field(default_factory=dict)


class ActivityEvent(ActivityEventCreate):
    id: int


class AuditEventType(str, Enum):
    system_created = "system_created"
    system_updated = "system_updated"
    system_deleted = "system_deleted"
    risk_tier_changed = "risk_tier_changed"
    policy_mapping_changed = "policy_mapping_changed"


class AuditEvent(BaseModel):
    id: int
    event_type: AuditEventType
    target_id: Optional[int]
    user_id: str
    timestamp: datetime
    summary: str


class LLMInteractionLog(BaseModel):
    id: int | None = None
    timestamp: datetime
    user_id: str
    system_id: Optional[int]
    prompt_template_version: str
    input_summary: str
    model_name: str
    response_summary: str
    success: bool


class DashboardSummary(BaseModel):
    total_systems: int
    systems_by_risk: Dict[RiskTier, int]
    systems_missing_controls: int
    total_events: int
    events_per_system: Dict[int, int]

