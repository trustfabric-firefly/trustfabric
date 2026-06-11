"use client";

import { useCallback, useEffect, useState } from "react";
import {
    readScanIntegrationsEnabled,
    writeScanIntegrationsEnabled,
    type ScanAppId,
    type ScanIntegrationsEnabled,
} from "@/lib/scan-integrations";

export function useScanIntegrationsEnabled() {
    const [enabled, setEnabled] = useState<ScanIntegrationsEnabled>(() => readScanIntegrationsEnabled());

    useEffect(() => {
        setEnabled(readScanIntegrationsEnabled());
    }, []);

    const toggle = useCallback((id: ScanAppId, value?: boolean) => {
        setEnabled((prev) => {
            const next = { ...prev, [id]: value ?? !prev[id] };
            writeScanIntegrationsEnabled(next);
            return next;
        });
    }, []);

    return { enabled, toggle };
}
