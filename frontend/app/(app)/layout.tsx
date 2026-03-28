import { Sidebar } from "@/components/layout/Sidebar";
import { AppAuthGate } from "@/components/auth/AppAuthGate";
import { Suspense } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <AppAuthGate>
            <div className="layout">
                <Sidebar />
                <div className="layout__content animate-in">
                    <Suspense fallback={null}>{children}</Suspense>
                </div>
            </div>
        </AppAuthGate>
    );
}
