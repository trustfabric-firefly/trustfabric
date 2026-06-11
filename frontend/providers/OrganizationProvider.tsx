"use client";

import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useState,
    type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { organizationsApi, setActiveOrganizationId, type OrganizationContext } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

const LOCAL_ORG_KEY = "trustfabric_organization_id";
const ADMIN_ROLES = new Set(["owner", "admin", "security_admin"]);

type OrganizationEntry = OrganizationContext["organizations"][number];

interface OrganizationContextValue {
    loading: boolean;
    context: OrganizationContext | null;
    activeOrganizationId: string | null;
    activeOrganization: OrganizationEntry | null;
    canAdmin: boolean;
    refresh: () => Promise<void>;
    switchOrganization: (organizationId: string) => void;
}

const OrganizationCtx = createContext<OrganizationContextValue | null>(null);

export function OrganizationProvider({ children }: { children: ReactNode }) {
    const { user, loading: authLoading, isDevMode } = useAuth();
    const queryClient = useQueryClient();
    const [context, setContext] = useState<OrganizationContext | null>(null);
    const [activeOrganizationId, setActiveOrganizationIdState] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    const refresh = useCallback(async () => {
        if (authLoading) return;
        if (!user && !isDevMode) {
            setContext(null);
            setActiveOrganizationIdState(null);
            setLoading(false);
            return;
        }

        setLoading(true);
        try {
            const ctx = await organizationsApi.me();
            setContext(ctx);
            const stored =
                typeof window !== "undefined" ? window.localStorage.getItem(LOCAL_ORG_KEY) : null;
            const validStored = stored && ctx.organizations.some((o) => o.organization.id === stored);
            const nextId = validStored ? stored! : ctx.primary_organization_id;
            setActiveOrganizationIdState(nextId);
            setActiveOrganizationId(nextId);
        } catch {
            if (isDevMode) {
                setActiveOrganizationIdState("default");
                setActiveOrganizationId("default");
            }
        } finally {
            setLoading(false);
        }
    }, [authLoading, user, isDevMode]);

    useEffect(() => {
        void refresh();
    }, [refresh]);

    const switchOrganization = useCallback(
        (organizationId: string) => {
            if (!context?.organizations.some((o) => o.organization.id === organizationId)) {
                return;
            }
            setActiveOrganizationIdState(organizationId);
            setActiveOrganizationId(organizationId);
            void queryClient.invalidateQueries();
        },
        [context, queryClient]
    );

    const activeOrganization = useMemo(
        () => context?.organizations.find((o) => o.organization.id === activeOrganizationId) ?? null,
        [context, activeOrganizationId]
    );

    const canAdmin = activeOrganization ? ADMIN_ROLES.has(activeOrganization.role) : false;

    return (
        <OrganizationCtx.Provider
            value={{
                loading: authLoading || loading,
                context,
                activeOrganizationId,
                activeOrganization,
                canAdmin,
                refresh,
                switchOrganization,
            }}
        >
            {children}
        </OrganizationCtx.Provider>
    );
}

export function useOrganization() {
    const ctx = useContext(OrganizationCtx);
    if (!ctx) throw new Error("useOrganization must be used inside <OrganizationProvider>");
    return ctx;
}
