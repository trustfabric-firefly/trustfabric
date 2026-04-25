// ─── Enums ────────────────────────────────────────────────────────────────────

export type ModelType = "LLM" | "ML" | "Agent" | "Other";
export type DataSensitivity = "Low" | "Medium" | "High";
export type SystemStatus = "Draft" | "Active" | "Retired";
export type RiskTier = "Tier 1" | "Tier 2" | "Tier 3";
export type PolicyKey =
  | "logging_required"
  | "human_review_required"
  | "pii_restrictions";
export type AuditEventType =
  | "system_created"
  | "system_updated"
  | "system_deleted"
  | "risk_tier_changed"
  | "policy_mapping_changed";

// ─── Core Domain ─────────────────────────────────────────────────────────────

export interface AISystem {
  id: number;
  name: string;
  description: string;
  owner: string;
  business_unit: string;
  model_type: ModelType;
  data_sensitivity: DataSensitivity;
  external_integrations: string[];
  status: SystemStatus;
  risk_tier: RiskTier | null;
  risk_justification: string | null;
  required_policies: PolicyKey[];
  missing_required_controls: boolean;
  created_at: string;
  updated_at: string;
  // Populated after a compliance scan runs against this system
  last_scan_id?: string | null;
  last_scan_date?: string | null;
  compliance_score?: number | null;
  active_violations?: number | null;
}

export interface AISystemCreate {
  name: string;
  description: string;
  owner: string;
  business_unit: string;
  model_type: ModelType;
  data_sensitivity: DataSensitivity;
  external_integrations?: string[];
  status?: SystemStatus;
  risk_tier?: RiskTier | null;
  risk_justification?: string | null;
}

export interface AISystemUpdate extends Partial<AISystemCreate> { }

export interface ActivityEvent {
  id: number;
  system_id: number;
  timestamp: string;
  user_id: string;
  event_type: string;
  metadata: Record<string, unknown>;
}

export interface AuditEvent {
  id: number;
  event_type: AuditEventType;
  target_id: number | null;
  user_id: string;
  timestamp: string;
  summary: string;
}

export interface DashboardSummary {
  total_systems: number;
  systems_by_risk: Partial<Record<RiskTier, number>>;
  systems_missing_controls: number;
  total_events: number;
  events_per_system: Record<string, number>;
}

export interface NistFunctionCoverage {
  function: string;
  total_controls: number;
  active: number;
  draft: number;
  inactive: number;
  missing: number;
}

export interface NistCoverage {
  functions: NistFunctionCoverage[];
  total_controls: number;
  total_active: number;
}

export interface CopilotRecommendation {
  raw_response: string;
  model: string;
  disclaimer: string;
  nist_ai_rmf_functions: string[];
  system_risk_hint: {
    current_risk_tier: RiskTier;
    data_sensitivity: DataSensitivity;
  };
}

// ─── Parsed Copilot output ────────────────────────────────────────────────────

export interface ParsedRecommendation {
  suggested_model_type: ModelType;
  suggested_data_sensitivity: DataSensitivity;
  suggested_risk_tier: string;
  suggested_policies: PolicyKey[];
  rationale: string;
  clarifying_questions: string[];
}

// ─── Policy Domain ────────────────────────────────────────────────────────────

export type PolicySeverity = "low" | "medium" | "high";
export type PolicyStatus = "active" | "inactive" | "draft";
export type PolicyCreationMethod = "manual" | "template" | "ai_generated";
export type PolicyCategory =
  | "model_restrictions"
  | "feature_control"
  | "security"
  | "quality_control"
  | "data_privacy"
  | "access_control"
  | "cost_management"
  | "compliance";

export interface Policy {
  id: string;
  name: string;
  description: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  status: PolicyStatus;
  creation_method: PolicyCreationMethod;
  applies_to: string[];
  rules?: Record<string, unknown>;
  created_by: string;
  created_at: string;
  updated_at: string;
  version: number;
  /** Present when loaded from the API (Firestore-backed governance policy). */
  system_id?: number;
  /** Denormalized for the policies list UI. */
  system_name?: string;
}

export interface PolicyCreate {
  name: string;
  description: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  applies_to: string[];
  creation_method: PolicyCreationMethod;
  rules?: Record<string, unknown>;
}

export interface PolicyTemplate {
  id: string;
  name: string;
  description: string;
  category: PolicyCategory;
  severity: PolicySeverity;
  used_by: number;
  default_rules: Record<string, unknown>;
  customizable_fields: string[];
}

// ─── Scan Policies ───────────────────────────────────────────────────────────

export interface ScanPolicy {
  check_id: string;
  name: string;
  description: string;
  severity: PolicySeverity;
  enabled: boolean;
  tier: "personal" | "enterprise";
  user_id: string;
  created_at: string;
  updated_at: string;
}

// ─── GitHub Integration ───────────────────────────────────────────────────────

export interface GitHubUserInfo {
  login: string;
  name: string | null;
  avatar_url: string;
  public_repos: number;
  orgs: string[];
  connected_at: string;
}

export interface GitHubIntegrationStatus {
  connected: boolean;
  user: GitHubUserInfo | null;
}

// ─── Slack Integration ────────────────────────────────────────────────────────

export interface SlackConnectionInfo {
  team_name: string;
  channel_id: string;
  channel_name: string;
  connected_at: string;
}

export interface SlackIntegrationStatus {
  connected: boolean;
  info: SlackConnectionInfo | null;
}

export interface SlackChannel {
  id: string;
  name: string;
}

// ─── Compliance Scans Domain ─────────────────────────────────────────────────

export type ScanStatus = "pending" | "running" | "completed" | "failed";
export type ScanScope = "organization" | "repositories" | "teams";
export type ViolationStatus = "violation" | "compliant";

export interface ScanViolation {
  policy_id: string;
  policy_name: string;
  status: ViolationStatus;
  severity: PolicySeverity;
  evidence: string;
  recommendation: string;
  risk_score: number;
  affected_repositories?: string[];
}

export interface ScanConfig {
  scope: ScanScope;
  policies_checked: string[];
  github_org: string;
  selected_repos?: string[];
  selected_teams?: string[];
}

export interface GitHubConfig {
  enabled_models: string[];
  cli_enabled: boolean;
  ide_features: Record<string, boolean>;
  secret_scanning_enabled: boolean;
  code_review_required: boolean;
}

export interface ScanResult {
  scan_id: string;
  organization: string;
  timestamp: string;
  config: ScanConfig;
  github_config: GitHubConfig;
  results: {
    compliance_score: number;
    total_policies: number;
    violations: ScanViolation[];
    compliant: ScanViolation[];
    scanned_repositories?: string[];
  };
  duration_seconds: number;
  triggered_by: string;
  status: ScanStatus;
}

export interface ScanProgress {
  step: string;
  percentage: number;
  completed_steps: string[];
  current_step: string;
  pending_steps: string[];
}

// ─── Enhanced AI Systems Inventory ───────────────────────────────────────────

export type AISystemType =
  | "code_assistant"
  | "chat_interface"
  | "design_tool"
  | "analytics"
  | "writing_assistant"
  | "productivity"
  | "custom";

export type RiskLevel = "low" | "high" | "critical";

export type DataAccessType =
  | "proprietary_source_code"
  | "customer_data"
  | "financial_records"
  | "pii"
  | "internal_docs"
  | "public_data";

export type ScanStatusType = "compliant" | "violations" | "not_scanned";

export interface AISystemInventoryItem {
  id: string;
  name: string;
  type: AISystemType;
  description: string;

  // Ownership
  owner: string;
  contact_email: string;
  department: string;

  // Risk assessment
  risk_level: RiskLevel;
  data_sensitivity: DataSensitivity;
  data_access_types: DataAccessType[];

  // Platform details
  platform: string;
  provider: string;
  models_used: string[];
  external_integrations: string[];

  // Connection info
  connected: boolean;
  connection_type?: string;

  // Compliance status
  last_scan_id?: string;
  last_scan_date?: string;
  compliance_score?: number;
  active_violations: number;
  scan_status: ScanStatusType;

  // Metadata
  status: "active" | "archived" | "draft";
  registered_by: string;
  registered_at: string;
  updated_at: string;
}

/** Payload shape for the Systems UI “register” flow (distinct from API `AISystemCreate`). */
export interface AISystemInventoryCreate {
  name: string;
  type: AISystemType;
  description: string;
  owner: string;
  contact_email: string;
  department: string;
  data_sensitivity: DataSensitivity;
  data_access_types: DataAccessType[];
  platform: string;
  models_used: string[];
  external_integrations: string[];
  connected?: boolean;
}

export interface SystemAuditEntry {
  id: string;
  timestamp: string;
  event: string;
  details?: string;
}

// ─── Enhanced Audit Log ──────────────────────────────────────────────────────

export type AuditActionCategory =
  | "scan"
  | "policy"
  | "system"
  | "settings"
  | "user"
  | "security"
  | "report"
  | "auth";

export type AuditSeverity = "info" | "warning" | "critical";
export type AuditStatus = "success" | "failure" | "pending";

export interface AuditLogEntry {
  event_id: string;
  timestamp: string;

  // Who
  user_id: string;
  user_email: string;
  user_role?: string;

  // Session info
  session_id?: string;
  ip_address: string;
  user_agent: string;
  location?: {
    city: string;
    region: string;
    country: string;
  };

  // What action
  event_type: string;
  action: string;
  action_category: AuditActionCategory;
  severity: AuditSeverity;
  status: AuditStatus;

  // What was affected
  resource: {
    type: string;
    id: string;
    name?: string;
  };

  // Result/Changes
  result?: Record<string, unknown>;
  changes?: {
    before?: Record<string, unknown>;
    after?: Record<string, unknown>;
  };

  // Related records
  related_records?: string[];

  // API calls made
  api_calls?: {
    service: string;
    endpoint: string;
    method: string;
    status: number;
  }[];

  // Metadata
  metadata?: Record<string, unknown>;
}

// ─── Compliance Frameworks ───────────────────────────────────────────────────

export type FrameworkRequirementStatus = "passed" | "failed" | "partial" | "manual";

export interface FrameworkRequirementResult {
  id: string;
  article: string;
  title: string;
  description: string;
  status: FrameworkRequirementStatus;
  score: number; // 0.0–1.0
  auto_evaluable: boolean;
  evidence: string[];
  gaps: string[];
  checklist: string[];
  checklist_done: boolean[];
}

export interface FrameworkResult {
  framework_id: string;
  framework_name: string;
  framework_short_name: string;
  framework_version: string;
  scan_id: string;
  evaluated_at: string;
  overall_score: number; // 0–100
  auto_score: number;    // 0–100 (auto-only)
  total_requirements: number;
  auto_requirements: number;
  manual_requirements: number;
  passed_requirements: number;
  partial_requirements: number;
  failed_requirements: number;
  requirements: FrameworkRequirementResult[];
}

export interface FrameworkMeta {
  id: string;
  name: string;
  short_name: string;
  version: string;
  scope: string;
  total_requirements: number;
  auto_requirements: number;
}

export interface ComplianceEvaluationResponse {
  scan_id: string;
  frameworks: FrameworkResult[];
}
