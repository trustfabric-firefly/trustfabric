import { auth } from "./firebase";
import type {
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    ActivityEvent,
    AuditEvent,
    CopilotRecommendation,
    DashboardSummary,
    Policy,
    PolicyCreate,
    PolicyStatus,
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

const BASE_URL = normalizeBaseUrl(RAW_BASE_URL);


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


export const systemsApi = {
    list: () => request<AISystem[]>("/api/v1/systems/"),
    get: (id: number) => request<AISystem>(`/api/v1/systems/${id}`),
    create: (data: AISystemCreate) =>
        request<AISystem>("/api/v1/systems/", {
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
