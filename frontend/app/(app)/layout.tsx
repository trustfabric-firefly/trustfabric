import { Sidebar } from "@/components/layout/Sidebar";
import { Suspense } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="layout">
            <Sidebar />
            <div className="layout__content animate-in">
                <Suspense fallback={null}>
                    {children}
                </Suspense>
            </div>
        </div>
    );
}
