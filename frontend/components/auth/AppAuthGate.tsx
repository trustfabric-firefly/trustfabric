"use client";

import { useEffect } from "react";
import { useRouter, usePathname } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import { isFirebaseConfigured } from "@/lib/firebase";

export function AppAuthGate({ children }: { children: React.ReactNode }) {
    const { user, loading, isDevMode } = useAuth();
    const router = useRouter();
    const pathname = usePathname();

    useEffect(() => {
        if (!isFirebaseConfigured || isDevMode) return;
        if (loading) return;
        if (!user) {
            const returnTo = encodeURIComponent(pathname || "/dashboard");
            router.replace(`/login?returnTo=${returnTo}`);
        }
    }, [user, loading, isDevMode, router, pathname]);

    if (!isFirebaseConfigured || isDevMode) {
        return <>{children}</>;
    }
    if (loading) {
        return (
            <div
                className="layout"
                style={{
                    alignItems: "center",
                    justifyContent: "center",
                    minHeight: "100vh",
                }}
            >
                <p style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-12)" }}>
                    Loading…
                </p>
            </div>
        );
    }
    if (!user) {
        return null;
    }
    return <>{children}</>;
}
