"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/** Brand compliance scans now live under Integrations → Figma. */
export default function BrandCompliancePage() {
    const router = useRouter();

    useEffect(() => {
        router.replace("/scans?app=figma");
    }, [router]);

    return null;
}
