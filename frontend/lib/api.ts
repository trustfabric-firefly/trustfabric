import { auth } from "./firebase";
import type {
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    ActivityEvent,
    AuditEvent,
    CopilotRecommendation,
    DashboardSummary,
<<<<<<< Updated upstream
=======
    GitHubIntegrationStatus,
    Policy,
    PolicyCreate,
    PolicyStatus,
    ScanPolicy,
    ScanResult,
>>>>>>> Stashed changes
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";


async function getAuthHeaders(): Promise<HeadersInit> {
    const user = auth.currentUser;
    if (!user) {
        const devToken = process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN;
        if (devToken) return { Authorization: `Bearer ${devToken}` };
        throw new Error("Not authenticated");
    }
    const token = await user.getIdToken();
    return { Authorization: `Bearer ${token}` };
}


async function request<T>(
    path: string,
    options: RequestInit = {}
): Promise<T> {
    const authHeaders = await getAuthHeaders();
    const res = await fetch(`${BASE_URL}${path}`, {
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


export const systemsApi = {
    list: () => request<AISystem[]>("/api/v1/systems"),
    get: (id: number) => request<AISystem>(`/api/v1/systems/${id}`),
    create: (data: AISystemCreate) =>
        request<AISystem>("/api/v1/systems", {
            method: "POST",
            body: JSON.stringify(data),
        }),
    update: (id: number, data: AISystemUpdate) =>
        request<AISystem>(`/api/v1/systems/${id}`, {
            method: "PATCH",
            body: JSON.stringify(data),
        }),
    delete: (id: number) =>
        request<void>(`/api/v1/systems/${id}`, { method: "DELETE" }),
};


export const eventsApi = {
    list: (systemId?: number) => {
        const qs = systemId ? `?system_id=${systemId}` : "";
        return request<ActivityEvent[]>(`/api/v1/events${qs}`);
    },
};


export const dashboardApi = {
    summary: () => request<DashboardSummary>("/api/v1/dashboard"),
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
<<<<<<< Updated upstream
=======

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
};

export const integrationsApi = {
    getGitHubConnectUrl: () =>
        request<{ url: string }>("/api/v1/integrations/github/connect"),
    getGitHubStatus: () =>
        request<GitHubIntegrationStatus>("/api/v1/integrations/github/status"),
    disconnectGitHub: () =>
        request<{ message: string }>("/api/v1/integrations/github", { method: "DELETE" }),
};

export type BackendStatus = {
    app_version: string;
    app_env: string;
    llm_provider: string;
    llm_model: string;
    gemini_model: string;
    claude_api_configured: boolean;
    gemini_api_configured: boolean;
    firebase_configured: boolean;
    github_oauth_configured: boolean;
    rate_limit_per_minute: number;
};

export const settingsApi = {
    status: () => request<BackendStatus>("/api/v1/settings/status"),
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
>>>>>>> Stashed changes
