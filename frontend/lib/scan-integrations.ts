export type ScanAppId = "github" | "aws" | "figma";

export type ScanIntegrationDef = {
    id: ScanAppId;
    name: string;
    url: string;
    description: string;
    category: "Developer tools" | "Cloud" | "Design";
    /** Transparent brand logo (Simple Icons CDN) — light theme */
    logoSrc: string;
    /** Transparent brand logo — dark theme */
    logoSrcDark: string;
};

export const SCAN_INTEGRATIONS: readonly ScanIntegrationDef[] = [
    {
        id: "github",
        name: "GitHub",
        url: "github.com",
        description:
            "Scan repositories for branch protection, pull request reviews, vulnerability alerts, and GitHub Actions security settings.",
        category: "Developer tools",
        logoSrc: "https://cdn.simpleicons.org/github/181717",
        logoSrcDark: "https://cdn.simpleicons.org/github/FFFFFF",
    },
    {
        id: "aws",
        name: "AWS",
        url: "aws.amazon.com",
        description:
            "Audit cloud infrastructure controls including IAM, S3, CloudTrail, AWS Config, and Security Hub across your connected account.",
        category: "Cloud",
        logoSrc: "/integrations/aws.svg",
        logoSrcDark: "https://massive.io/wp-content/uploads/2023/01/aws-logo-white.png",
    },
    {
        id: "figma",
        name: "Figma",
        url: "figma.com",
        description:
            "Analyze design assets against brand guidelines — typography, colors, spacing, and component usage in your Figma files.",
        category: "Design",
        logoSrc: "https://cdn.simpleicons.org/figma/000000",
        logoSrcDark: "https://cdn.simpleicons.org/figma/FFFFFF",
    },
] as const;

const STORAGE_KEY = "trustfabric_scan_integrations_enabled";

export type ScanIntegrationsEnabled = Record<ScanAppId, boolean>;

const DEFAULT_ENABLED: ScanIntegrationsEnabled = {
    github: true,
    aws: true,
    figma: true,
};

export function readScanIntegrationsEnabled(): ScanIntegrationsEnabled {
    if (typeof window === "undefined") return { ...DEFAULT_ENABLED };
    try {
        const raw = window.localStorage.getItem(STORAGE_KEY);
        if (!raw) return { ...DEFAULT_ENABLED };
        const parsed = JSON.parse(raw) as Partial<ScanIntegrationsEnabled>;
        return { ...DEFAULT_ENABLED, ...parsed };
    } catch {
        return { ...DEFAULT_ENABLED };
    }
}

export function writeScanIntegrationsEnabled(next: ScanIntegrationsEnabled) {
    if (typeof window === "undefined") return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
}

export function isScanAppId(value: string | null): value is ScanAppId {
    return value === "github" || value === "aws" || value === "figma";
}
