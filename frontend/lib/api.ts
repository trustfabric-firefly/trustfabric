import { auth } from "./firebase";
import type {
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    ActivityEvent,
    AuditEvent,
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
const LOCAL_TOKEN_KEY = "trustfabric_api_token";

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


async function getAuthHeaders(): Promise<HeadersInit> {
    const user = auth?.currentUser;
    if (user) {
        const token = await user.getIdToken();
        return { Authorization: `Bearer ${token}` };
    }
    if (typeof window !== "undefined") {
        const localToken = window.localStorage.getItem(LOCAL_TOKEN_KEY);
        if (localToken) return { Authorization: `Bearer ${localToken}` };
    }
    const devToken =
        process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN
        ?? process.env.NEXT_PUBLIC_DEV_VIEWER_TOKEN;
    if (devToken) return { Authorization: `Bearer ${devToken}` };
    throw new Error("Not authenticated");
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
        throw new Error(error.detail ?? "Request failed");
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
};

export const policyApi = {
    generate: (prompt: string, history: string[] = []) =>
        request<PolicyRecommendationResponse>("/api/v1/copilot/policies/recommendations", {
            method: "POST",
            body: JSON.stringify({ prompt, history }),
        }),
};
