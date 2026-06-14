"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { APP_MAIN_NAV_HREFS } from "@/lib/navigation";

/**
 * After paint, warm the RSC + JS cache for all primary sidebar targets so the first
 * click feels like the second. Runs at idle to avoid contending with LCP/TTI.
 */
export function usePrefetchAppRoutes() {
    const router = useRouter();

    useEffect(() => {
        if (typeof window === "undefined") {
            return;
        }

        const run = () => {
            for (const href of APP_MAIN_NAV_HREFS) {
                try {
                    void router.prefetch(href);
                } catch {
                    /* no-op: prefetch is best-effort */
                }
            }
        };

        const w = window as unknown as {
            requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
            cancelIdleCallback?: (id: number) => void;
        };

        if (w.requestIdleCallback) {
            const id = w.requestIdleCallback(() => run(), { timeout: 4000 });
            return () => w.cancelIdleCallback?.(id);
        }

        const t = window.setTimeout(run, 200);
        return () => clearTimeout(t);
    }, [router]);
}
