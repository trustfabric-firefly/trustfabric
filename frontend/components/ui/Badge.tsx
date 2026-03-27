import type { RiskTier, SystemStatus, DataSensitivity, PolicyKey } from "@/types";

interface BadgeProps {
    children: React.ReactNode;
    variant?:
    | "tier1" | "tier2" | "tier3"
    | "draft" | "active" | "retired"
    | "accent" | "warning" | "danger" | "neutral";
}

export function Badge({ children, variant = "neutral" }: BadgeProps) {
    return <span className={`badge badge--${variant}`}>{children}</span>;
}

// ─── Convenience wrappers ─────────────────────────────────────────────────────

export function RiskTierBadge({ tier }: { tier: RiskTier | null }) {
    if (!tier) return <span className="text-muted">—</span>;
    const map: Record<RiskTier, "tier1" | "tier2" | "tier3"> = {
        "Tier 1": "tier1",
        "Tier 2": "tier2",
        "Tier 3": "tier3",
    };
    return <Badge variant={map[tier]}>{tier}</Badge>;
}

export function StatusBadge({ status }: { status: SystemStatus }) {
    const map: Record<SystemStatus, "draft" | "active" | "retired"> = {
        Draft: "draft",
        Active: "active",
        Retired: "retired",
    };
    return <Badge variant={map[status]}>{status}</Badge>;
}

export function SensitivityBadge({ level }: { level: DataSensitivity }) {
    const map: Record<DataSensitivity, "tier1" | "tier2" | "tier3"> = {
        Low: "tier1",
        Medium: "tier2",
        High: "tier3",
    };
    return <Badge variant={map[level]}>{level}</Badge>;
}

const POLICY_LABELS: Record<PolicyKey, string> = {
    logging_required: "Logging",
    human_review_required: "Human Review",
    pii_restrictions: "PII Restricted",
};

export function PolicyBadge({ policyKey }: { policyKey: PolicyKey }) {
    return <Badge variant="accent">{POLICY_LABELS[policyKey]}</Badge>;
}
