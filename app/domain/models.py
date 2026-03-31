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
    # Populated when a compliance scan runs against this system
    last_scan_id: Optional[str] = None
    last_scan_date: Optional[datetime] = None
    compliance_score: Optional[int] = None
    active_violations: Optional[int] = None


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
    policy_created = "policy_created"
    policy_updated = "policy_updated"


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


# --- UI governance policies (stored under Firestore: systems/{id}/policies/{policyDocId}) ---


class GovernancePolicyCategory(str, Enum):
    model_restrictions = "model_restrictions"
    feature_control = "feature_control"
    security = "security"
    quality_control = "quality_control"
    data_privacy = "data_privacy"
    access_control = "access_control"
    cost_management = "cost_management"
    compliance = "compliance"


class GovernancePolicySeverity(str, Enum):
    low = "low"
    medium = "medium"
    high = "high"


class GovernancePolicyCreationMethod(str, Enum):
    manual = "manual"
    template = "template"
    ai_generated = "ai_generated"


class GovernancePolicyStatus(str, Enum):
    active = "active"
    inactive = "inactive"
    draft = "draft"


# --- Compliance Scans ---


class ScanStatus(str, Enum):
    pending = "pending"
    running = "running"
    completed = "completed"
    failed = "failed"


class ViolationStatus(str, Enum):
    violation = "violation"
    compliant = "compliant"


class ScanViolation(BaseModel):
    policy_id: str
    policy_name: str
    status: ViolationStatus
    severity: GovernancePolicySeverity
    evidence: str
    recommendation: str
    risk_score: int


class ScanConfig(BaseModel):
    scope: str
    github_org: str
    policies_checked: List[str]


class GitHubScannedConfig(BaseModel):
    enabled_models: List[str] = Field(default_factory=list)
    cli_enabled: bool = False
    ide_features: Dict[str, Any] = Field(default_factory=dict)
    secret_scanning_enabled: bool = False
    code_review_required: bool = False


class ScanResults(BaseModel):
    compliance_score: int
    total_policies: int
    violations: List[ScanViolation]
    compliant: List[ScanViolation]


class ScanRecord(BaseModel):
    scan_id: str
    organization: str
    timestamp: datetime
    config: ScanConfig
    github_config: GitHubScannedConfig
    results: ScanResults
    duration_seconds: float
    triggered_by: str
    status: ScanStatus


class ScanTriggerRequest(BaseModel):
    github_org: str
    scope: str = "repositories"


# --- Scan Policies (user-scoped, drive which checks run) ---


class ScanPolicy(BaseModel):
    check_id: str
    name: str
    description: str
    severity: GovernancePolicySeverity
    enabled: bool = True
    tier: str = "personal"   # "personal" | "enterprise"
    user_id: str
    created_at: datetime
    updated_at: datetime


# --- GitHub Integration ---


class GitHubUserInfo(BaseModel):
    login: str
    name: Optional[str] = None
    avatar_url: str
    public_repos: int = 0
    orgs: List[str] = Field(default_factory=list)
    connected_at: datetime


class GitHubIntegrationStatus(BaseModel):
    connected: bool
    user: Optional[GitHubUserInfo] = None


# --- Compliance Framework Evaluation ---


class FrameworkRequirementStatus(str, Enum):
    passed = "passed"
    failed = "failed"
    partial = "partial"
    manual = "manual"  # not auto-evaluable, awaiting attestation


class FrameworkRequirementResult(BaseModel):
    id: str
    article: str
    title: str
    description: str
    status: FrameworkRequirementStatus
    score: float  # 0.0–1.0
    auto_evaluable: bool
    evidence: List[str]
    gaps: List[str]
    checklist: List[str] = Field(default_factory=list)
    checklist_done: List[bool] = Field(default_factory=list)


class FrameworkResult(BaseModel):
    framework_id: str
    framework_name: str
    framework_short_name: str
    framework_version: str
    scan_id: str
    evaluated_at: datetime
    overall_score: int       # 0–100, partial counts 0.5
    auto_score: int          # 0–100, auto-only requirements
    total_requirements: int
    auto_requirements: int
    manual_requirements: int
    passed_requirements: int
    partial_requirements: int
    failed_requirements: int
    requirements: List[FrameworkRequirementResult]


class GovernancePolicyCreate(BaseModel):
    name: str = Field(..., min_length=1, max_length=500)
    description: str = Field(..., min_length=1, max_length=8000)
    category: GovernancePolicyCategory
    severity: GovernancePolicySeverity
    applies_to: List[str] = Field(default_factory=list)
    creation_method: GovernancePolicyCreationMethod
    rules: Optional[Dict[str, Any]] = None
    status: GovernancePolicyStatus = GovernancePolicyStatus.draft


class GovernancePolicyUpdate(BaseModel):
    status: Optional[GovernancePolicyStatus] = None


class GovernancePolicy(BaseModel):
    id: str
    system_id: int
    name: str
    description: str
    category: GovernancePolicyCategory
    severity: GovernancePolicySeverity
    applies_to: List[str]
    creation_method: GovernancePolicyCreationMethod
    status: GovernancePolicyStatus
    rules: Optional[Dict[str, Any]] = None
    created_by: str
    created_at: datetime
    updated_at: datetime
    version: int = 1

