# pydantic models for systems, events, audits, risk tiers, policies, LLM logs

from __future__ import annotations

from datetime import datetime
from enum import Enum
from typing import Any, Dict, List, Optional

from pydantic import BaseModel, Field, field_validator


class OrgRole(str, Enum):
    owner = "owner"
    admin = "admin"
    security_admin = "security_admin"
    auditor = "auditor"
    viewer = "viewer"


class Organization(BaseModel):
    id: str
    name: str
    created_at: datetime
    created_by: str
    plan: str = "trial"
    compliance_contact_email: Optional[str] = None


class OrganizationCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)


class OrganizationUpdate(BaseModel):
    name: str = Field(..., min_length=2, max_length=120)
    compliance_contact_email: Optional[str] = Field(default=None, max_length=254)


class OrganizationMember(BaseModel):
    organization_id: str
    user_id: str
    role: OrgRole
    email: Optional[str] = None
    joined_at: datetime


class OrganizationInviteStatus(str, Enum):
    pending = "pending"
    accepted = "accepted"
    revoked = "revoked"


class OrganizationInvite(BaseModel):
    id: str
    organization_id: str
    email: str
    role: OrgRole
    invited_by: str
    status: OrganizationInviteStatus = OrganizationInviteStatus.pending
    created_at: datetime
    accepted_at: Optional[datetime] = None


class OrganizationInviteCreate(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)
    role: OrgRole = OrgRole.viewer

    @field_validator("role")
    @classmethod
    def reject_owner_invite(cls, role: OrgRole) -> OrgRole:
        if role == OrgRole.owner:
            raise ValueError("Owner role cannot be invited")
        return role


class OrganizationMemberUpdate(BaseModel):
    role: OrgRole

    @field_validator("role")
    @classmethod
    def reject_owner_assignment(cls, role: OrgRole) -> OrgRole:
        if role == OrgRole.owner:
            raise ValueError("Owner role cannot be assigned")
        return role


class OrganizationSsoConfig(BaseModel):
    organization_id: str
    enabled: bool = False
    enforced: bool = False
    idp_entity_id: str = ""
    idp_sso_url: str = ""
    idp_x509_cert: str = ""
    email_domains: List[str] = Field(default_factory=list)
    jit_provisioning: bool = True
    default_role: OrgRole = OrgRole.viewer
    updated_at: datetime


class OrganizationSsoConfigUpdate(BaseModel):
    enabled: bool = False
    enforced: bool = False
    idp_entity_id: str = Field(default="", max_length=512)
    idp_sso_url: str = Field(default="", max_length=1024)
    idp_x509_cert: str = ""
    email_domains: List[str] = Field(default_factory=list)
    jit_provisioning: bool = True
    default_role: OrgRole = OrgRole.viewer

    @field_validator("default_role")
    @classmethod
    def reject_owner_sso_default(cls, role: OrgRole) -> OrgRole:
        if role == OrgRole.owner:
            raise ValueError("Owner role cannot be the SSO default role")
        return role


class OrganizationCopilotQuota(BaseModel):
    organization_id: str
    enabled: bool = True
    monthly_request_limit: int = 200
    monthly_cost_cap_usd: Optional[float] = 25.0
    daily_request_limit_per_user: Optional[int] = 50
    updated_at: Optional[datetime] = None


class OrganizationCopilotQuotaUpdate(BaseModel):
    enabled: Optional[bool] = None
    monthly_request_limit: Optional[int] = Field(default=None, ge=0, le=100_000)
    monthly_cost_cap_usd: Optional[float] = Field(default=None, ge=0)
    daily_request_limit_per_user: Optional[int] = Field(default=None, ge=0, le=10_000)


class OrganizationCopilotUsage(BaseModel):
    organization_id: str
    period: str
    request_count: int = 0
    estimated_cost_usd: float = 0.0
    last_request_at: Optional[datetime] = None


class OrganizationCopilotControls(BaseModel):
    quota: OrganizationCopilotQuota
    usage: OrganizationCopilotUsage
    platform_max_monthly_request_limit: int
    platform_max_monthly_cost_cap_usd: float
    estimated_cost_per_request_usd: float


class SsoDiscoverRequest(BaseModel):
    email: str = Field(..., min_length=3, max_length=254)


class SsoExchangeRequest(BaseModel):
    code: str = Field(..., min_length=8, max_length=128)


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
    organization_id: str
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
    organization_id: str


class AuditEventType(str, Enum):
    system_created = "system_created"
    system_updated = "system_updated"
    system_deleted = "system_deleted"
    risk_tier_changed = "risk_tier_changed"
    policy_mapping_changed = "policy_mapping_changed"
    policy_created = "policy_created"
    policy_updated = "policy_updated"
    member_invited = "member_invited"
    member_role_changed = "member_role_changed"
    member_removed = "member_removed"
    invite_revoked = "invite_revoked"


class AuditEvent(BaseModel):
    id: int
    organization_id: str
    event_type: AuditEventType
    target_id: Optional[int]
    user_id: str
    timestamp: datetime
    summary: str


class LLMInteractionLog(BaseModel):
    id: int | None = None
    organization_id: str | None = None
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


class NistFunctionCoverage(BaseModel):
    """Coverage counts for one NIST AI RMF function (Govern / Map / Measure / Manage)."""
    function: str           # "Govern" | "Map" | "Measure" | "Manage"
    total_controls: int     # fixed number of controls for this function
    active: int             # policies with status=active mapped to this function
    draft: int              # policies with status=draft
    inactive: int           # policies with status=inactive
    missing: int            # controls with no policy at all


class NistCoverage(BaseModel):
    functions: List[NistFunctionCoverage]
    total_controls: int
    total_active: int


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
    affected_repositories: List[str] = Field(default_factory=list)


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
    scanned_repositories: List[str] = Field(default_factory=list)


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


# --- Slack Integration ---


class SlackConnectionInfo(BaseModel):
    team_name: str
    channel_id: str
    channel_name: str
    connected_at: datetime


class SlackIntegrationStatus(BaseModel):
    connected: bool
    info: Optional[SlackConnectionInfo] = None


# --- AWS Integration ---


class AwsConnectionInfo(BaseModel):
    account_id: str
    account_alias: str = ""
    role_arn: str
    region: str = "us-east-1"
    connected_at: datetime


class AwsIntegrationStatus(BaseModel):
    connected: bool
    info: Optional[AwsConnectionInfo] = None


class AwsConnectRequest(BaseModel):
    role_arn: str = Field(..., min_length=20)
    region: str = Field(default="us-east-1")


# --- Figma Integration ---


class FigmaUserInfo(BaseModel):
    id: str
    email: str
    handle: str
    img_url: str = ""
    connected_at: datetime


class FigmaIntegrationStatus(BaseModel):
    connected: bool
    user: Optional[FigmaUserInfo] = None


class FigmaConnectRequest(BaseModel):
    access_token: str = Field(..., min_length=10)


class AwsCheckResult(BaseModel):
    check_id: str
    check_name: str
    severity: GovernancePolicySeverity
    passed: bool
    evidence: str
    recommendation: str = ""
    risk_score: int = 0
    affected_resources: List[str] = Field(default_factory=list)


class AwsScanRecord(BaseModel):
    scan_id: str
    account_id: str
    region: str
    timestamp: datetime
    compliance_score: int
    total_checks: int
    passed_checks: int
    failed_checks: int
    checks: List[AwsCheckResult]
    duration_seconds: float
    triggered_by: str
    status: ScanStatus


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


class AIChatMessageRole(str, Enum):
    user = "user"
    ai = "ai"


class AIChatMessageCreate(BaseModel):
    role: AIChatMessageRole
    content: str = Field(..., min_length=1, max_length=12000)
    policy: Optional[GovernancePolicyCreate] = None
    rules: Optional[Dict[str, Any]] = None
    provider: Optional[str] = Field(default=None, max_length=100)
    model: Optional[str] = Field(default=None, max_length=200)


class AIChatMessage(AIChatMessageCreate):
    id: str
    system_id: int
    user_id: str
    created_at: datetime
