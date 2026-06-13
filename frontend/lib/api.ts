import { auth } from "./firebase";
import { getDevBearerToken, IS_PRODUCTION_BUILD } from "./auth-config";
import type {
    AIChatMessage,
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    ActivityEvent,
    AuditEvent,
    AwsIntegrationStatus,
    AwsScanResult,
    ComplianceEvaluationResponse,
    CopilotRecommendation,
    DashboardSummary,
    FrameworkMeta,
    GitHubIntegrationStatus,
    NistCoverage,
    Policy,
    PolicyCreate,
    PolicyStatus,
    ScanPolicy,
    ScanResult,
    SlackChannel,
    SlackIntegrationStatus,
} from "@/types";

const RAW_BASE_URL =
    process.env.NEXT_PUBLIC_API_BASE_URL ??
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:8000";
const LOCAL_ORG_KEY = "trustfabric_organization_id";

function normalizeBaseUrl(value: string): string {
    const trimmed = value.trim();
    if (!trimmed) return "http://localhost:8000";
    if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
        return trimmed.replace(/\/+$/, "");
    }
    // Support values like 127.0.0.1:8000 by adding default protocol.
    return `http://${trimmed.replace(/\/+$/, "")}`;
}

/** Resolved API origin (same logic as internal requests). Use for Settings / diagnostics. */
export const RESOLVED_API_BASE_URL = normalizeBaseUrl(RAW_BASE_URL);

const BASE_URL = RESOLVED_API_BASE_URL;


function getOrganizationHeader(): HeadersInit {
    if (typeof window === "undefined") return {};
    const orgId = window.localStorage.getItem(LOCAL_ORG_KEY);
    return orgId ? { "X-Organization-Id": orgId } : {};
}

export function setActiveOrganizationId(orgId: string) {
    if (typeof window !== "undefined") {
        window.localStorage.setItem(LOCAL_ORG_KEY, orgId);
    }
}

async function getAuthHeaders(): Promise<HeadersInit> {
    const user = auth?.currentUser;
    if (user) {
        const token = await user.getIdToken();
        return { Authorization: `Bearer ${token}`, ...getOrganizationHeader() };
    }
    const devToken = getDevBearerToken();
    if (devToken) {
        return { Authorization: `Bearer ${devToken}`, ...getOrganizationHeader() };
    }
    if (IS_PRODUCTION_BUILD) {
        throw new Error("Authentication required. Sign in to continue.");
    }
    throw new Error("Not authenticated");
}


function parseApiErrorDetail(detail: unknown, fallback: string): string {
    if (typeof detail === "string" && detail.trim()) return detail;
    if (Array.isArray(detail)) {
        const parts = detail
            .map((item) => {
                if (typeof item === "string") return item;
                if (item && typeof item === "object" && "msg" in item) {
                    return String((item as { msg: unknown }).msg);
                }
                return "";
            })
            .filter(Boolean);
        if (parts.length) return parts.join("; ");
    }
    return fallback;
}

async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const authHeaders = await getAuthHeaders();
    const endpoint = new URL(path, `${BASE_URL}/`).toString();
    const res = await fetch(endpoint, {
        ...options,
        headers: {
            "Content-Type": "application/json",
            ...authHeaders,
            ...options.headers,
        },
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(parseApiErrorDetail(error.detail, res.statusText || "Request failed"));
    }

    // 204 No Content
    if (res.status === 204) return undefined as T;
    return res.json() as Promise<T>;
}

async function requestText(
    path: string,
    options: RequestInit = {}
): Promise<string> {
    const authHeaders = await getAuthHeaders();
    const endpoint = new URL(path, `${BASE_URL}/`).toString();
    const res = await fetch(endpoint, {
        ...options,
        headers: {
            ...authHeaders,
            ...options.headers,
        },
    });

    if (!res.ok) {
        const error = await res.json().catch(() => ({ detail: res.statusText }));
        throw new Error(error.detail ?? "Request failed");
    }

    return res.text();
}


export const systemsApi = {
    list: () => request<AISystem[]>("/api/v1/systems/"),
    get: (id: number) => request<AISystem>(`/api/v1/systems/${id}`),
    create: (data: AISystemCreate) =>
        request<AISystem>("/api/v1/systems/", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    explainMissing: (id: number) =>
        request<ExplainMissingResponse>(`/api/v1/systems/${id}/explain-missing`, { method: "POST" }),
    update: (id: number, data: AISystemUpdate) =>
        request<AISystem>(`/api/v1/systems/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: number) =>
        request<void>(`/api/v1/systems/${id}`, { method: "DELETE" }),
};

/** Governance policies stored under Firestore `systems/{id}/policies/{policyId}`. */
export const systemPoliciesApi = {
    list: (systemId: number) =>
        request<Policy[]>(`/api/v1/systems/${systemId}/policies`),
    create: (systemId: number, body: PolicyCreate & { status: PolicyStatus }) =>
        request<Policy>(`/api/v1/systems/${systemId}/policies`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    update: (systemId: number, policyId: string, body: { status: PolicyStatus }) =>
        request<Policy>(`/api/v1/systems/${systemId}/policies/${policyId}`, {
            method: "PATCH",
            body: JSON.stringify(body),
        }),
};


export const eventsApi = {
    list: (systemId?: number) => {
        const qs = systemId ? `?system_id=${systemId}` : "";
        return request<ActivityEvent[]>(`/api/v1/events${qs}`);
    },
};


export const dashboardApi = {
    summary: () => request<DashboardSummary>("/api/v1/dashboard"),
    nistCoverage: () => request<NistCoverage>("/api/v1/dashboard/nist-coverage"),
};


export const auditApi = {
    list: () => request<AuditEvent[]>("/api/v1/audit"),
};


export const copilotApi = {
    recommend: (systemId: number) =>
        request<CopilotRecommendation>(
            `/api/v1/copilot/systems/${systemId}/recommendations`,
            { method: "POST" }
        ),
};

export const scanPoliciesApi = {
    list: () => request<ScanPolicy[]>("/api/v1/scan-policies/"),
    toggle: (checkId: string, enabled: boolean) =>
        request<ScanPolicy>(`/api/v1/scan-policies/${checkId}`, {
            method: "PATCH",
            body: JSON.stringify({ enabled }),
        }),
};

export const scansApi = {
    trigger: (body: { github_org: string; scope: string }) =>
        request<ScanResult>("/api/v1/scans/", { method: "POST", body: JSON.stringify(body) }),
    list: () => request<ScanResult[]>("/api/v1/scans/"),
    get: (scanId: string) => request<ScanResult>(`/api/v1/scans/${scanId}`),
    reportUrl: (scanId: string) => `${RESOLVED_API_BASE_URL}/api/v1/scans/${scanId}/report`,
    getReportHtml: (scanId: string) => requestText(`/api/v1/scans/${scanId}/report`),
};

export const awsScansApi = {
    trigger: () =>
        request<AwsScanResult>("/api/v1/scans/aws", { method: "POST" }),
    list: () => request<AwsScanResult[]>("/api/v1/scans/aws"),
    get: (scanId: string) => request<AwsScanResult>(`/api/v1/scans/aws/${scanId}`),
};

export const integrationsApi = {
    getGitHubConnectUrl: () =>
        request<{ url: string }>("/api/v1/integrations/github/connect"),
    getGitHubStatus: () =>
        request<GitHubIntegrationStatus>("/api/v1/integrations/github/status"),
    disconnectGitHub: () =>
        request<{ message: string }>("/api/v1/integrations/github", { method: "DELETE" }),
    getSlackConnectUrl: () =>
        request<{ url: string }>("/api/v1/integrations/slack/connect"),
    getSlackStatus: () =>
        request<SlackIntegrationStatus>("/api/v1/integrations/slack/status"),
    disconnectSlack: () =>
        request<{ message: string }>("/api/v1/integrations/slack", { method: "DELETE" }),
    testSlack: () =>
        request<{ message: string }>("/api/v1/integrations/slack/test", { method: "POST" }),
    getSlackChannels: () =>
        request<SlackChannel[]>("/api/v1/integrations/slack/channels"),
    updateSlackChannel: (channel_id: string, channel_name: string) =>
        request<{ message: string }>("/api/v1/integrations/slack/channel", {
            method: "PATCH",
            body: JSON.stringify({ channel_id, channel_name }),
        }),
    connectAws: (role_arn: string, region: string) =>
        request<AwsIntegrationStatus>("/api/v1/integrations/aws/connect", {
            method: "POST",
            body: JSON.stringify({ role_arn, region }),
        }),
    getAwsStatus: () =>
        request<AwsIntegrationStatus>("/api/v1/integrations/aws/status"),
    testAws: () =>
        request<{ message: string }>("/api/v1/integrations/aws/test", { method: "POST" }),
    disconnectAws: () =>
        request<{ message: string }>("/api/v1/integrations/aws", { method: "DELETE" }),
    connectFigma: (access_token: string) =>
        request<FigmaIntegrationStatus>("/api/v1/integrations/figma/connect", {
            method: "POST",
            body: JSON.stringify({ access_token }),
        }),
    getFigmaStatus: () =>
        request<FigmaIntegrationStatus>("/api/v1/integrations/figma/status"),
    disconnectFigma: () =>
        request<{ message: string }>("/api/v1/integrations/figma", { method: "DELETE" }),
};

export type BackendStatus = {
    app_version: string;
    app_env: string;
    llm_provider: string;
    llm_model: string;
    openai_model: string;
    gemini_model: string;
    openai_api_configured: boolean;
    claude_api_configured: boolean;
    gemini_api_configured: boolean;
    firebase_configured: boolean;
    github_oauth_configured: boolean;
    slack_oauth_configured: boolean;
    aws_configured: boolean;
    rate_limit_per_minute: number;
};

export type ExplainMissingResponse = {
    summary: string;
    missing_controls: { control: string; why_required: string }[];
    action_steps: string[];
    risk_if_ignored: string;
    nist_functions: string[];
    system_name: string;
    risk_tier: string | null;
    disclaimer: string;
};

export const settingsApi = {
    status: () => request<BackendStatus>("/api/v1/settings/status"),
};

export type OrganizationContext = {
    primary_organization_id: string;
    organizations: Array<{
        organization: {
            id: string;
            name: string;
            plan: string;
            compliance_contact_email?: string | null;
        };
        role: string;
        is_primary: boolean;
    }>;
};

export type OrganizationMember = {
    organization_id: string;
    user_id: string;
    role: string;
    email?: string | null;
    joined_at: string;
};

export type OrganizationInvite = {
    id: string;
    organization_id: string;
    email: string;
    role: string;
    invited_by: string;
    status: string;
    created_at: string;
    accepted_at?: string | null;
};

export type OrgRole = "owner" | "admin" | "security_admin" | "auditor" | "viewer";

export type SsoDiscovery = {
    sso_available: boolean;
    organization_id?: string;
    organization_name?: string;
    enforced?: boolean;
};

export type OrganizationSsoSummary = {
    enabled: boolean;
    enforced: boolean;
    idp_entity_id?: string;
    idp_sso_url?: string;
    idp_x509_cert_configured?: boolean;
    email_domains: string[];
    jit_provisioning: boolean;
    default_role: OrgRole;
    updated_at?: string;
    sp_entity_id: string;
    sp_acs_url: string;
    metadata_url: string;
    login_url: string;
};

export const ssoApi = {
    discover: (email: string) =>
        request<SsoDiscovery>("/api/v1/auth/sso/discover", {
            method: "POST",
            body: JSON.stringify({ email }),
        }),
    exchange: (code: string) =>
        request<{
            custom_token: string;
            organization_id: string;
            return_to: string;
            email: string;
        }>("/api/v1/auth/sso/exchange", {
            method: "POST",
            body: JSON.stringify({ code }),
        }),
    loginUrl: (organizationId: string, returnTo?: string) => {
        const url = new URL(`/api/v1/auth/sso/${encodeURIComponent(organizationId)}/login`, `${BASE_URL}/`);
        if (returnTo) url.searchParams.set("return_to", returnTo);
        return url.toString();
    },
};

export const organizationsApi = {
    me: () => request<OrganizationContext>("/api/v1/organizations/me"),
    current: () =>
        request<{
            organization: OrganizationContext["organizations"][number]["organization"];
            role: string;
            user_id: string;
        }>("/api/v1/organizations/current"),
    updateCurrent: (body: { name: string; compliance_contact_email?: string | null }) =>
        request<{ organization: OrganizationContext["organizations"][number]["organization"] }>(
            "/api/v1/organizations/current",
            { method: "PATCH", body: JSON.stringify(body) }
        ),
    members: () => request<OrganizationMember[]>("/api/v1/organizations/current/members"),
    updateMemberRole: (userId: string, role: OrgRole) =>
        request<OrganizationMember>(`/api/v1/organizations/current/members/${encodeURIComponent(userId)}`, {
            method: "PATCH",
            body: JSON.stringify({ role }),
        }),
    removeMember: (userId: string) =>
        request<{ ok: boolean }>(`/api/v1/organizations/current/members/${encodeURIComponent(userId)}`, {
            method: "DELETE",
        }),
    invites: () => request<OrganizationInvite[]>("/api/v1/organizations/current/invites"),
    inviteMember: (body: { email: string; role: OrgRole }) =>
        request<{ status: "invited" | "added"; invite?: OrganizationInvite; member?: OrganizationMember }>(
            "/api/v1/organizations/current/invites",
            { method: "POST", body: JSON.stringify(body) }
        ),
    revokeInvite: (inviteId: string) =>
        request<{ ok: boolean }>(`/api/v1/organizations/current/invites/${encodeURIComponent(inviteId)}`, {
            method: "DELETE",
        }),
    getSso: () => request<OrganizationSsoSummary>("/api/v1/organizations/current/sso"),
    updateSso: (body: {
        enabled: boolean;
        enforced: boolean;
        idp_entity_id: string;
        idp_sso_url: string;
        idp_x509_cert: string;
        email_domains: string[];
        jit_provisioning: boolean;
        default_role: OrgRole;
    }) =>
        request<OrganizationSsoSummary>("/api/v1/organizations/current/sso", {
            method: "PUT",
            body: JSON.stringify(body),
        }),
    disableSso: () =>
        request<OrganizationSsoSummary>("/api/v1/organizations/current/sso", { method: "DELETE" }),
    create: (name: string) =>
        request<{ organization: { id: string; name: string } }>("/api/v1/organizations/", {
            method: "POST",
            body: JSON.stringify({ name }),
        }),
};

export const complianceApi = {
    listFrameworks: () => request<FrameworkMeta[]>("/api/v1/compliance/frameworks"),
    evaluate: (scanId: string) =>
        request<ComplianceEvaluationResponse>(`/api/v1/compliance/evaluate/${scanId}`),
    refresh: (scanId: string) =>
        request<ComplianceEvaluationResponse>(`/api/v1/compliance/evaluate/${scanId}/refresh`),
    submitAttestation: (body: {
        framework_id: string;
        req_id: string;
        item_index: number;
        value: boolean;
    }) =>
        request<{ ok: boolean }>("/api/v1/compliance/attestations", {
            method: "POST",
            body: JSON.stringify(body),
        }),
    getAttestations: (frameworkId: string) =>
        request<Record<string, boolean>>(`/api/v1/compliance/attestations/${frameworkId}`),
};

export type PolicyRecommendationResponse = {
    content: string;
    policy: PolicyCreate;
    rules?: Record<string, unknown>;
    provider?: string;
    model?: string;
};

export const policyApi = {
    generate: (prompt: string, history: string[] = []) =>
        request<PolicyRecommendationResponse>("/api/v1/copilot/policies/recommendations", {
            method: "POST",
            body: JSON.stringify({ prompt, history }),
        }),
    listChatHistory: (systemId: number) =>
        request<AIChatMessage[]>(`/api/v1/copilot/systems/${systemId}/policy-chat`),
    saveChatMessage: (
        systemId: number,
        body: {
            role: "user" | "ai";
            content: string;
            policy?: PolicyCreate;
            rules?: Record<string, unknown>;
            provider?: string;
            model?: string;
        }
    ) =>
        request<AIChatMessage>(`/api/v1/copilot/systems/${systemId}/policy-chat/messages`, {
            method: "POST",
            body: JSON.stringify(body),
        }),
    generateForSystemChat: (systemId: number, prompt: string) =>
        request<PolicyRecommendationResponse & {
            user_message: AIChatMessage;
            assistant_message: AIChatMessage;
        }>(`/api/v1/copilot/systems/${systemId}/policy-chat/generate`, {
            method: "POST",
            body: JSON.stringify({ prompt }),
        }),
};

// --- Brand Compliance Scanner ---

export type BrandCheck = {
    id: string;
    name: string;
    category: "color" | "typography" | "logo" | "imagery" | "content" | "prohibited";
    status: "pass" | "fail" | "warning" | "not_applicable";
    severity: "low" | "medium" | "high" | "critical";
    evidence: string;
    recommendation: string;
};

export type BrandComplianceResult = {
    overall_score: number;
    overall_status: "compliant" | "needs_review" | "non_compliant";
    summary: string;
    checks: BrandCheck[];
    recommendations: string[];
    brand_name: string;
    scanned_at: string;
    model: string;
    disclaimer: string;
};

export type BrandGuidelines = {
    company_name: string;
    primary_colors: { name: string; hex: string }[];
    secondary_colors: { name: string; hex: string }[];
    typography: { primary_font: string; body_font: string; rules: string };
    logo_rules: string[];
    imagery_style: string[];
    content_tone: string[];
    prohibited: string[];
};

export const brandComplianceApi = {
    scan: async (file: File): Promise<BrandComplianceResult> => {
        const authHeaders = await getAuthHeaders();
        const formData = new FormData();
        formData.append("file", file);

        const endpoint = new URL("/api/v1/brand-compliance/scan", `${BASE_URL}/`).toString();
        const res = await fetch(endpoint, {
            method: "POST",
            headers: { ...authHeaders },
            body: formData,
        });

        if (!res.ok) {
            const error = await res.json().catch(() => ({ detail: res.statusText }));
            throw new Error(error.detail ?? "Brand compliance scan failed");
        }

        return res.json();
    },
    getGuidelines: () => request<BrandGuidelines>("/api/v1/brand-compliance/guidelines"),
};

// --- Figma Integration ---

export type FigmaUser = { id: string; email: string; handle: string; img_url: string; connected_at?: string };
export type FigmaIntegrationStatus = { connected: boolean; user?: FigmaUser };
export type FigmaStatus = FigmaIntegrationStatus & { error?: string };
export type FigmaProject = { id: string; name: string };
export type FigmaFile = { key: string; name: string; thumbnail_url?: string; last_modified?: string };
export type FigmaFrame = {
    id: string; name: string; type: string; page: string;
    file_key: string; file_name: string;
    width?: number; height?: number; thumbnail_url?: string;
};
export type FigmaScanResult = {
    results: (BrandComplianceResult & { node_id: string; status: string; error?: string })[];
    summary: {
        total: number; scanned: number; errors: number;
        average_score: number; compliant: number; needs_review: number; non_compliant: number;
    };
};

export const figmaApi = {
    status: () => integrationsApi.getFigmaStatus(),
    teamProjects: (teamId: string) => request<{ projects: FigmaProject[] }>(`/api/v1/figma/teams/${teamId}/projects`),
    projectFiles: (projectId: string) => request<{ files: FigmaFile[] }>(`/api/v1/figma/projects/${projectId}/files`),
    fileFrames: (fileKey: string) => request<{ frames: FigmaFrame[]; count: number }>(`/api/v1/figma/files/${fileKey}/frames`),
    batchScan: (fileKey: string, nodeIds: string[] = []) =>
        request<FigmaScanResult>("/api/v1/figma/scan", {
            method: "POST",
            body: JSON.stringify({ file_key: fileKey, node_ids: nodeIds }),
        }),
};
