import { auth } from "./firebase";
import type {
    AISystem,
    AISystemCreate,
    AISystemUpdate,
    ActivityEvent,
    AuditEvent,
    CopilotRecommendation,
    DashboardSummary,
} from "@/types";

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8000";


async function getAuthHeaders(): Promise<HeadersInit> {
    const user = auth?.currentUser;
    if (user) {
        const token = await user.getIdToken();
        return { Authorization: `Bearer ${token}` };
    }

    // Local dev fallback (when Firebase auth is not configured in frontend).
    const devToken =
        process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN
        ?? process.env.NEXT_PUBLIC_DEV_VIEWER_TOKEN
        ?? "admin-dev-token";

    return { Authorization: `Bearer ${devToken}` };
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
