"use client";
import { VerifiedUserOutlinedIcon, GppMaybeOutlinedIcon, TimelineOutlinedIcon, VisibilityOutlinedIcon, TrendingUpOutlinedIcon, TrendingDownOutlinedIcon, WarningAmberOutlinedIcon, CheckCircleOutlinedIcon, OpenInNewOutlinedIcon, MemoryOutlinedIcon, GitHubIcon, ForumOutlinedIcon, CloudOutlinedIcon, StorageOutlinedIcon, DescriptionOutlinedIcon, BoltOutlinedIcon, ChevronRightOutlinedIcon, ExpandMoreIcon, BrushOutlinedIcon, TagOutlinedIcon } from "@/lib/icons"
import type { AppIconComponent } from "@/lib/icons";

import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { TopBar } from "@/components/layout/TopBar";
import { RiskTierBadge } from "@/components/ui/Badge";
import { GlowingEffect } from "@/components/ui/glowing-effect";
import { dashboardApi, systemsApi, auditApi, integrationsApi, scansApi } from "@/lib/api";
import { dashboardIntegrationSettingsHref } from "@/lib/integration-sections";
import type { RiskTier } from "@/types";
const TIER_ORDER: RiskTier[] = ["Tier 3", "Tier 2", "Tier 1"];

/* Framework heatmap layouts. NIST AI RMF cells come from /dashboard/nist-coverage;
   other frameworks show unevaluated cells until live coverage is available. */
const FRAMEWORK_CONFIGS = {
    nist_rmf: {
        label: "NIST AI RMF",
        version: "1.0",
        categories: [
            { id: "GV", name: "Govern", controls: 6 },
            { id: "MP", name: "Map", controls: 5 },
            { id: "MS", name: "Measure", controls: 5 },
            { id: "MG", name: "Manage", controls: 4 },
        ],
    },
    soc2: {
        label: "SOC 2",
        version: "2017",
        categories: [
            { id: "CC6", name: "Access", controls: 3 },
            { id: "CC7", name: "Operations", controls: 3 },
            { id: "CC8", name: "Change Mgmt", controls: 2 },
            { id: "CC3", name: "Risk", controls: 2 },
        ],
    },
    eu_ai_act: {
        label: "EU AI Act",
        version: "2024",
        categories: [
            { id: "Art.9", name: "Risk Mgmt", controls: 3 },
            { id: "Art.10", name: "Data Gov.", controls: 2 },
            { id: "Art.13", name: "Transparency", controls: 3 },
            { id: "Art.14", name: "Oversight", controls: 3 },
        ],
    },
    nist_csf: {
        label: "NIST CSF",
        version: "1.1",
        categories: [
            { id: "ID", name: "Identify", controls: 3 },
            { id: "PR", name: "Protect", controls: 4 },
            { id: "DE", name: "Detect", controls: 2 },
            { id: "RS", name: "Respond", controls: 2 },
        ],
    },
} as const;

function emptyHeatmap(
    categories: readonly { id: string; name: string; controls: number }[],
): number[][] {
    return categories.map((cat) => Array(cat.controls).fill(0) as number[]);
}

function coverageToHeatmap(
    categories: readonly { id: string; name: string; controls: number }[],
    functions: { function: string; active: number; draft: number; inactive: number; missing: number }[],
): number[][] {
    return categories.map((cat) => {
        const fn = functions.find((f) => f.function === cat.name);
        if (!fn) return Array(cat.controls).fill(0) as number[];
        const cells: number[] = [];
        for (let i = 0; i < fn.active; i++) cells.push(3);
        for (let i = 0; i < fn.draft; i++) cells.push(2);
        for (let i = 0; i < fn.inactive; i++) cells.push(1);
        for (let i = 0; i < fn.missing; i++) cells.push(0);
        while (cells.length < cat.controls) cells.push(0);
        return cells.slice(0, cat.controls);
    });
}

type FrameworkKey = keyof typeof FRAMEWORK_CONFIGS;

type IntegrationCardStatus = "connected" | "needs_setup" | "coming_soon" | "disconnected";

const INTEGRATIONS: {
    name: string;
    desc: string;
    icon: AppIconComponent;
    status: IntegrationCardStatus;
}[] = [
    { name: "GitHub", desc: "Code scanning & PR reviews", icon: GitHubIcon, status: "needs_setup" },
    { name: "Figma", desc: "Design & brand compliance", icon: BrushOutlinedIcon, status: "needs_setup" },
    { name: "Slack", desc: "Alerts & notifications", icon: TagOutlinedIcon, status: "needs_setup" },
    { name: "AWS", desc: "Cloud infrastructure audit", icon: CloudOutlinedIcon, status: "needs_setup" },
    { name: "Azure", desc: "Identity & access management", icon: StorageOutlinedIcon, status: "coming_soon" },
    { name: "Google Cloud", desc: "Vertex AI model monitoring", icon: CloudOutlinedIcon, status: "coming_soon" },
    { name: "Jira", desc: "Issue tracking & remediation", icon: BoltOutlinedIcon, status: "coming_soon" },
];

const STATUS_LABELS = { connected: "Connected", needs_setup: "Needs setup", coming_soon: "Coming soon.", disconnected: "Not connected" };
const STATUS_BADGE = { connected: "badge--live", needs_setup: "badge--warning", coming_soon: "badge--neutral", disconnected: "badge--neutral" };

export default function DashboardPage() {
    const { data: summary, isLoading: loadingSummary } = useQuery({
        queryKey: ["dashboard"],
        queryFn: dashboardApi.summary,
        refetchInterval: 60_000,
    });

    const { data: systems = [] } = useQuery({
        queryKey: ["systems"],
        queryFn: systemsApi.list,
    });

    const { data: auditEvents = [] } = useQuery({
        queryKey: ["audit"],
        queryFn: auditApi.list,
    });

    const { data: nistCoverage } = useQuery({
        queryKey: ["nist-coverage"],
        queryFn: dashboardApi.nistCoverage,
        refetchInterval: 60_000,
    });

    const missingControls = systems.filter((s) => s.missing_required_controls);
    const compliantSystems = systems.filter((s) => !s.missing_required_controls);
    const total = summary?.total_systems ?? 0;
    const complianceRate =
        systems.length > 0
            ? Math.round((compliantSystems.length / systems.length) * 100)
            : 0;
    const enforcementRate = total > 0 ? Math.round(((total - missingControls.length) / total) * 100) : 0;

    const recentAudits = [...auditEvents]
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 6);

    const [selectedFramework, setSelectedFramework] = useState<FrameworkKey>("nist_rmf");
    const activeFramework = FRAMEWORK_CONFIGS[selectedFramework];

    const heatmapData = useMemo(() => {
        if (selectedFramework === "nist_rmf" && nistCoverage) {
            return coverageToHeatmap(activeFramework.categories, nistCoverage.functions);
        }
        // No live coverage API yet for SOC 2 / EU AI Act / NIST CSF — show unevaluated cells only.
        return emptyHeatmap(activeFramework.categories);
    }, [selectedFramework, nistCoverage, activeFramework.categories]);

    const totalControls = activeFramework.categories.reduce((n: number, c: { controls: number }) => n + c.controls, 0);
    const passingControls = heatmapData.flat().filter((v) => v >= 3).length;
    const cellCount = heatmapData.flat().length || 1;

    // Recently viewed items synthesized from audit events + systems
    const recentlyViewed = useMemo(() => buildRecentlyViewed(systems, auditEvents), [systems, auditEvents]);

    const { data: latestScans = [] } = useQuery({
        queryKey: ["scans"],
        queryFn: scansApi.list,
        retry: false,
    });
    const latestScan = latestScans[0] ?? null;
    const scanScore = latestScan?.results.compliance_score ?? null;

    const { data: githubStatus } = useQuery({
        queryKey: ["github-status"],
        queryFn: integrationsApi.getGitHubStatus,
        retry: false,
    });

    const { data: slackStatus } = useQuery({
        queryKey: ["slack-status"],
        queryFn: integrationsApi.getSlackStatus,
        retry: false,
    });

    const { data: awsStatus } = useQuery({
        queryKey: ["aws-status"],
        queryFn: integrationsApi.getAwsStatus,
        retry: false,
    });

    const { data: figmaStatus } = useQuery({
        queryKey: ["figma-status"],
        queryFn: integrationsApi.getFigmaStatus,
        retry: false,
    });

    // Connected / failed integrations (GitHub + Slack + AWS status comes from API; rest are static placeholders)
    const githubConnected = githubStatus?.connected ?? false;
    const figmaConnected = figmaStatus?.connected ?? false;
    const slackConnected = slackStatus?.connected ?? false;
    const awsConnected = awsStatus?.connected ?? false;
    const dynamicNames = new Set(["GitHub", "Figma", "Slack", "AWS"]);
    const connectedCount = INTEGRATIONS.filter((i) => !dynamicNames.has(i.name) && i.status === "connected").length
        + (githubConnected ? 1 : 0) + (figmaConnected ? 1 : 0) + (slackConnected ? 1 : 0) + (awsConnected ? 1 : 0);
    const needsSetupCount = INTEGRATIONS.filter((i) => !dynamicNames.has(i.name) && i.status === "needs_setup").length
        + (!githubConnected ? 1 : 0) + (!figmaConnected ? 1 : 0) + (!slackConnected ? 1 : 0) + (!awsConnected ? 1 : 0);

    const frameworkHasLiveCoverage = selectedFramework === "nist_rmf";
    const evaluatedControls = heatmapData.flat().filter((v) => v !== 0).length;

    return (
        <>
            <TopBar
                title="Dashboard"
                subtitle="AI governance overview for your workspace"
            />
            <main className="page">

                {/* Row 1: KPI Stats */}
                <div className="stats-grid" style={{ marginBottom: "var(--s-4)" }}>
                    <StatTile
                        label="GitHub Scan Score"
                        value={scanScore !== null ? `${scanScore}%` : "—"}
                        sub={latestScan ? `Last scan: ${new Date(latestScan.timestamp).toLocaleDateString()}` : "No scans yet"}
                        trend={scanScore !== null ? (scanScore >= 75 ? "up" : "down") : undefined}
                        trendVal={scanScore !== null ? `${scanScore}%` : undefined}
                        icon={<VerifiedUserOutlinedIcon sx={{ fontSize: 18 }} />}
                        variant={scanScore === null ? "info" : scanScore >= 75 ? "success" : scanScore >= 50 ? "warning" : "danger"}
                    />
                    <StatTile label="Policy Enforcement Rate" value={loadingSummary ? "--" : `${enforcementRate}%`} sub="Controls actively enforced"
                        trend={enforcementRate > 0 ? "up" : undefined} trendVal={enforcementRate > 0 ? `${enforcementRate}%` : undefined}
                        icon={<GppMaybeOutlinedIcon sx={{ fontSize: 18 }} />} variant="warning" />
                    <StatTile label="Risk Exposure Level" value={loadingSummary ? "--" : String(missingControls.length)} sub="Systems with gaps"
                        trend={missingControls.length > 0 ? "down" : undefined} trendVal={missingControls.length > 0 ? `${missingControls.length}` : undefined}
                        icon={<VisibilityOutlinedIcon sx={{ fontSize: 18 }} />} variant="danger" />
                    <StatTile label="Audit Trail Volume" value={loadingSummary ? "--" : String(summary?.total_events ?? 0)} sub="Logged interactions"
                        icon={<TimelineOutlinedIcon sx={{ fontSize: 18 }} />} variant="info" />
                </div>

                                                {/* Main Dashboard Content Grid       */}
                <div className="grid grid--2-1" style={{ marginBottom: "var(--s-4)" }}>

                    {/* LEFT COLUMN: Heatmap + Gauge + Risk */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                        {/* Framework Control Coverage heatmap */}
                        <div className="panel">
                            <div className="panel__header">
                                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", flexWrap: "wrap" }}>
                                    <span className="panel__title">{activeFramework.label} Control Coverage</span>
                                    <span style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", padding: "1px 6px", border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)" }}>
                                        v{activeFramework.version}
                                    </span>
                                    <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                        Completion: <span style={{ color: "var(--c-live-text)", fontWeight: "var(--fw-semibold)" }}>
                                            {Math.round((passingControls / cellCount) * 100)}%
                                        </span>
                                    </span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                                    <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>
                                        {passingControls}/{heatmapData.flat().length} controls passing
                                    </span>
                                    <div style={{ position: "relative", display: "flex", alignItems: "center" }}>
                                        <select
                                            value={selectedFramework}
                                            onChange={(e) => setSelectedFramework(e.target.value as FrameworkKey)}
                                            style={{
                                                fontSize: "var(--fs-12)",
                                                padding: "6px 28px 6px 10px",
                                                background: "var(--c-surface-alt)",
                                                border: "1px solid var(--c-border)",
                                                borderRadius: "var(--r-md)",
                                                color: "var(--c-text)",
                                                cursor: "pointer",
                                                outline: "none",
                                                appearance: "none",
                                                minWidth: 120,
                                                fontWeight: "var(--fw-medium)",
                                                transition: "all 0.2s",
                                            }}
                                            onMouseEnter={(e) => (e.currentTarget.style.borderColor = "var(--c-accent)")}
                                            onMouseLeave={(e) => (e.currentTarget.style.borderColor = "var(--c-border)")}
                                        >
                                            {(Object.keys(FRAMEWORK_CONFIGS) as FrameworkKey[]).map((key) => (
                                                <option 
                                                    key={key} 
                                                    value={key} 
                                                    style={{ background: "#18181b", color: "#ffffff" }}
                                                >
                                                    {FRAMEWORK_CONFIGS[key].label}
                                                </option>
                                            ))}
                                        </select>
                                        <div style={{ position: "absolute", right: 8, pointerEvents: "none", display: "flex", color: "var(--c-text-muted)" }}>
                                            <ExpandMoreIcon style={{ fontSize: 16 }} />
                                        </div>
                                    </div>
                                </div>
                            </div>
                            <div className="panel__body">
                                {!frameworkHasLiveCoverage && (
                                    <p style={{
                                        fontSize: "var(--fs-12)",
                                        color: "var(--c-text-muted)",
                                        marginBottom: "var(--s-3)",
                                        padding: "var(--s-2) var(--s-3)",
                                        borderRadius: "var(--r-sm)",
                                        border: "1px solid var(--c-border)",
                                        background: "rgba(255,255,255,0.02)",
                                        lineHeight: 1.5,
                                    }}>
                                        Live control coverage for {activeFramework.label} is not available yet. Cells show as not evaluated.
                                    </p>
                                )}
                                {/* Category rows */}
                                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                                    {activeFramework.categories.map((cat, ci) => (
                                        <div key={cat.id} style={{ display: "flex", alignItems: "center", gap: "var(--s-3)" }}>
                                            <span style={{ width: 76, fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-secondary)", flexShrink: 0 }}>
                                                {cat.name}
                                            </span>
                                            <div style={{ display: "flex", gap: 3, flexWrap: "wrap" }}>
                                                {heatmapData[ci]?.map((level: number, j: number) => (
                                                    <div
                                                        key={j}
                                                        className={`heatmap__cell heatmap__cell--${level < 0 ? "fail" : level}`}
                                                        title={`${cat.id}-${j + 1}: ${level < 0 ? "Failing" : level === 0 ? "Not evaluated" : `Level ${level}`}`}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                </div>

                                {/* Legend */}
                                <div className="heatmap__legend">
                                    <span>Less</span>
                                    <div className="heatmap__legend-cells">
                                        <div className="heatmap__cell heatmap__cell--0" style={{ width: 12, height: 12 }} />
                                        <div className="heatmap__cell heatmap__cell--1" style={{ width: 12, height: 12 }} />
                                        <div className="heatmap__cell heatmap__cell--2" style={{ width: 12, height: 12 }} />
                                        <div className="heatmap__cell heatmap__cell--3" style={{ width: 12, height: 12 }} />
                                        <div className="heatmap__cell heatmap__cell--4" style={{ width: 12, height: 12 }} />
                                    </div>
                                    <span>More</span>
                                    <span style={{ marginLeft: "var(--s-3)" }}>
                                        <span className="heatmap__cell heatmap__cell--fail" style={{ width: 12, height: 12, display: "inline-block" }} /> Failing
                                    </span>
                                </div>

                                {/* Coverage bar */}
                                <div style={{ marginTop: "var(--s-4)" }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4, fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                                        <span>{totalControls} total controls</span>
                                        <span>{totalControls > 0 ? `${Math.round((evaluatedControls / totalControls) * 100)}% evaluated` : "No controls"}</span>
                                    </div>
                                    <SegmentedBar segments={[
                                        { value: passingControls, color: "var(--c-live)", label: "Passing" },
                                        { value: heatmapData.flat().filter((v) => v < 0).length, color: "var(--c-critical)", label: "Failing" },
                                        { value: heatmapData.flat().filter((v) => v === 0).length, color: "var(--c-surface-hover)", label: "Not evaluated" },
                                    ]} />
                                </div>
                            </div>
                        </div>

                        <div className="grid grid--2" style={{ flex: 1 }}>
                            {/* Compliance Gauge */}
                            <div className="panel">
                                <div className="panel__header">
                                    <span className="panel__title">Policy Coverage</span>
                                </div>
                                <div className="panel__body" style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "var(--s-4)" }}>
                                    <CircularGauge value={complianceRate} size={140} strokeWidth={10} color="var(--c-live)" label="Coverage" />
                                    <div style={{ width: "100%" }}>
                                        {TIER_ORDER.map((tier) => {
                                            const count = summary?.systems_by_risk?.[tier] ?? 0;
                                            return (
                                                <div key={tier} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 0", borderBottom: "1px solid var(--c-border-subtle)", fontSize: "var(--fs-12)" }}>
                                                    <RiskTierBadge tier={tier} />
                                                    <span className="font-tabular" style={{ color: "var(--c-text)", fontWeight: "var(--fw-semibold)" }}>{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>

                            {/* Risk Exposure Breakdown */}
                            <div className="panel">
                                <div className="panel__header">
                                    <span className="panel__title">Risk Exposure Breakdown</span>
                                </div>
                                <div className="panel__body">
                                    <div style={{ marginBottom: "var(--s-5)" }}>
                                        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "var(--s-2)" }}>
                                            <span style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>Distribution</span>
                                        </div>
                                        <SegmentedBar segments={[
                                            { value: compliantSystems.length, color: "var(--c-live)", label: "Compliant" },
                                            { value: missingControls.length, color: "var(--c-high)", label: "At Risk" },
                                            { value: Math.max(0, total - compliantSystems.length - missingControls.length), color: "var(--c-info)", label: "Pending" },
                                        ]} />
                                    </div>
                                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                                        <MiniStat label="Compliant Systems" value={compliantSystems.length} color="var(--c-live)" total={total} />
                                        <MiniStat label="At-Risk Systems" value={missingControls.length} color="var(--c-high)" total={total} />
                                        <MiniStat label="Total Registered" value={total} color="var(--c-accent)" total={total} />
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* RIGHT COLUMN: Recently Viewed + Violations */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                        {/* Recently Viewed */}
                        <div className="panel">
                            <div className="panel__header">
                                <span className="panel__title">Recently Viewed</span>
                            </div>
                            <div className="panel__body--flush" style={{ maxHeight: 400, overflowY: "auto" }}>
                                {recentlyViewed.length === 0 ? (
                                    <div className="empty-state" style={{ padding: "var(--s-6)" }}>
                                        <p className="empty-state__desc">No recent activity.</p>
                                    </div>
                                ) : (
                                    <ul className="feed">
                                        {recentlyViewed.map((item, i) => {
                                            const IconComp = item.icon;
                                            return (
                                                <li key={i} className="feed__item">
                                                    <div className="feed__icon">
                                                        <IconComp sx={{ fontSize: 16 }} />
                                                    </div>
                                                    <div className="feed__body">
                                                        <div className="feed__label">{item.type}</div>
                                                        <div className="feed__title">{item.title}</div>
                                                        <div className="feed__badge">
                                                            <span className={`badge ${item.badgeClass}`}>{item.badge}</span>
                                                        </div>
                                                    </div>
                                                    <ChevronRightOutlinedIcon sx={{ fontSize: 16, color: "var(--c-text-muted)", marginTop: "4px", flexShrink: 0 }} />
                                                </li>
                                            );
                                        })}
                                    </ul>
                                )}
                            </div>
                        </div>

                        {/* Ethical AI Violations */}
                        <div className="panel">
                            <div className="panel__header">
                                <span className="panel__title">Ethical AI Violations</span>
                                <span className="panel__subtitle">{missingControls.length} issues</span>
                            </div>
                            <div className="panel__body--flush">
                                {missingControls.length === 0 ? (
                                    <div className="empty-state" style={{ padding: "var(--s-6)" }}>
                                        <div style={{ marginBottom: "var(--s-4)" }}>
                                            <img src="/all-clear.svg" alt="All clear" width={72} height={72} />
                                        </div>
                                        <p className="empty-state__title">All clear</p>
                                        <p className="empty-state__desc">No violations or missing controls detected.</p>
                                    </div>
                                ) : (
                                    <table className="table table--compact">
                                        <thead><tr><th>System</th><th>Risk</th><th>Status</th></tr></thead>
                                        <tbody>
                                            {missingControls.slice(0, 5).map((s) => (
                                                <tr key={s.id}>
                                                    <td style={{ fontWeight: "var(--fw-medium)" }}>{s.name}</td>
                                                    <td><RiskTierBadge tier={s.risk_tier} /></td>
                                                    <td><span className="severity severity--critical"><span className="severity__dot" />Missing</span></td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                )}
                            </div>
                        </div>
                    </div>
                </div>


                {/*  Row 4: Compliance Audits (timeline)  */}
                <div className="panel" style={{ marginBottom: "var(--s-4)" }}>
                    <div className="panel__header">
                        <span className="panel__title">Compliance Audits</span>
                        <Link href="/audit" className="btn btn--ghost btn--sm" style={{ gap: 4 }}>
                            Full log <OpenInNewOutlinedIcon sx={{ fontSize: 14 }} />
                        </Link>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderTop: "none" }}>
                        <AuditTimeline
                            title="NIST AI RMF Assessment"
                            period="Ongoing"
                            steps={["Govern", "Map", "Measure", "Manage"]}
                            activeIndex={1}
                        />
                        <AuditTimeline
                            title="Internal AI Policy Review"
                            period="Q1 2026"
                            steps={["Policy Draft", "Stakeholder Review", "Approval", "Publish"]}
                            activeIndex={2}
                        />
                    </div>
                </div>

                {/*  Row 5: Integrations + Live Audit Stream  */}
                <div className="grid grid--2">
                    {/* Integrations */}
                    <div className="panel">
                        <div className="panel__header">
                            <span className="panel__title">Integrations</span>
                        </div>
                        <div style={{ padding: "var(--s-3) var(--s-4)", borderBottom: "1px solid var(--c-border)", display: "flex", gap: "var(--s-4)" }}>
                            <IntegrationSummaryPill
                                count={connectedCount}
                                label="connected"
                            />
                            <IntegrationSummaryPill
                                count={needsSetupCount}
                                label="needs setup"
                            />
                        </div>
                        <div className="panel__body--flush">
                            {INTEGRATIONS.map((integ) => {
                                    const Icon = integ.icon;
                                const isGitHub = integ.name === "GitHub";
                                const isFigma = integ.name === "Figma";
                                const isSlack = integ.name === "Slack";
                                const isAws = integ.name === "AWS";
                                const effectiveStatus = isGitHub
                                    ? (githubConnected ? "connected" as const : "needs_setup" as const)
                                    : isFigma
                                        ? (figmaConnected ? "connected" as const : "needs_setup" as const)
                                    : isSlack
                                        ? (slackConnected ? "connected" as const : "needs_setup" as const)
                                        : isAws
                                            ? (awsConnected ? "connected" as const : "needs_setup" as const)
                                            : integ.status;
                                const desc = isGitHub && githubConnected && githubStatus?.user
                                    ? `@${githubStatus.user.login}${githubStatus.user.orgs.length ? ` · ${githubStatus.user.orgs.length} org(s)` : ""}`
                                    : isFigma && figmaConnected && figmaStatus?.user
                                        ? `@${figmaStatus.user.handle} · ${figmaStatus.user.email}`
                                    : isSlack && slackConnected && slackStatus?.info
                                        ? `${slackStatus.info.team_name} · #${slackStatus.info.channel_name}`
                                        : isAws && awsConnected && awsStatus?.info
                                            ? `Account ${awsStatus.info.account_id} · ${awsStatus.info.region}`
                                            : integ.desc;
                                const showConnect =
                                    (isGitHub && !githubConnected)
                                    || (isSlack && !slackConnected)
                                    || (isFigma && !figmaConnected)
                                    || (isAws && !awsConnected);
                                return (
                                    <div key={integ.name} className="integration">
                                        <div className="integration__logo">
                                            <Icon sx={{ fontSize: 18 }} />
                                        </div>
                                        <div className="integration__info">
                                            <div className="integration__name">{integ.name}</div>
                                            <div className="integration__desc">{desc}</div>
                                        </div>
                                        {showConnect ? (
                                            <Link
                                                href={dashboardIntegrationSettingsHref(integ.name)}
                                                className="btn btn--secondary btn--sm"
                                                style={{ borderRadius: "var(--r-pill)", fontSize: "var(--fs-11)", padding: "2px 10px", textDecoration: "none" }}
                                            >
                                                Connect
                                            </Link>
                                        ) : (
                                            <span className={`badge ${STATUS_BADGE[effectiveStatus]}`}>
                                                {STATUS_LABELS[effectiveStatus]}
                                            </span>
                                        )}
                                        <ChevronRightOutlinedIcon sx={{ fontSize: 16, color: "var(--c-text-muted)", flexShrink: 0 }} />
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    {/* Live Audit Stream */}
                    <div className="panel">
                        <div className="panel__header">
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                                <span className="panel__title">Live Audit Stream</span>
                                <span className="severity severity--live">
                                    <span className="severity__dot" />
                                    Live
                                </span>
                            </div>
                            <Link href="/audit" className="btn btn--ghost btn--sm" style={{ gap: 4 }}>
                                Full log <OpenInNewOutlinedIcon sx={{ fontSize: 14 }} />
                            </Link>
                        </div>
                        <div className="panel__body--flush">
                            {recentAudits.length === 0 ? (
                                <div className="empty-state" style={{ padding: "var(--s-6)" }}>
                                    <p className="empty-state__desc">No activity yet.</p>
                                </div>
                            ) : (
                                <table className="table table--compact">
                                    <thead><tr><th>Event</th><th>Summary</th><th>Time</th></tr></thead>
                                    <tbody>
                                        {recentAudits.map((ev) => (
                                            <tr key={ev.id}>
                                                <td>
                                                    <span className={`badge badge--${ev.event_type.includes("deleted") ? "danger" : ev.event_type.includes("risk") ? "warning" : ev.event_type.includes("created") ? "live" : "accent"}`}>
                                                        {ev.event_type.replace(/_/g, " ")}
                                                    </span>
                                                </td>
                                                <td className="text-secondary truncate" style={{ maxWidth: 180 }}>{ev.summary}</td>
                                                <td className="text-muted" style={{ whiteSpace: "nowrap", fontSize: "var(--fs-11)" }}>
                                                    {formatRelativeTime(ev.timestamp)}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            )}

                            {/* AI Systems mini-table at the bottom */}
                            {systems.length > 0 && (
                                <div style={{ borderTop: "1px solid var(--c-border)" }}>
                                    <div style={{ padding: "var(--s-3) var(--s-4)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <span style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-secondary)" }}>
                                            Data Privacy Incidents
                                        </span>
                                        <Link href="/systems" className="btn btn--ghost btn--sm" style={{ gap: 4 }}>
                                            View all <OpenInNewOutlinedIcon sx={{ fontSize: 14 }} />
                                        </Link>
                                    </div>
                                    <table className="table table--compact">
                                        <thead><tr><th>Name</th><th>Sensitivity</th><th>Status</th></tr></thead>
                                        <tbody>
                                            {systems.slice(0, 3).map((s) => (
                                                <tr key={s.id}>
                                                    <td style={{ fontWeight: "var(--fw-medium)" }}>{s.name}</td>
                                                    <td>
                                                        <span className={`severity severity--${s.data_sensitivity === "High" ? "critical" : s.data_sensitivity === "Medium" ? "medium" : "low"}`}>
                                                            <span className="severity__dot" />{s.data_sensitivity}
                                                        </span>
                                                    </td>
                                                    <td>
                                                        {s.missing_required_controls
                                                            ? <WarningAmberOutlinedIcon sx={{ fontSize: 16 }} />
                                                            : <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            )}
                        </div>
                    </div>
                </div>

            </main>
        </>
    );
}

function StatTile({
    label, value, sub, trend, trendVal, icon, variant = "success",
}: {
    label: string; value: string; sub: string;
    trend?: "up" | "down"; trendVal?: string;
    icon: React.ReactNode;
    variant?: "success" | "warning" | "danger" | "info";
}) {
    return (
        <div className={`stat-card stat-card--${variant}`}>
            <GlowingEffect
                spread={40}
                glow={true}
                disabled={false}
                proximity={64}
                inactiveZone={0.01}
                borderWidth={2}
            />
            <div style={{ position: "relative", zIndex: 10 }}>
                <div className="stat-card__icon">
                    <div className="stat-card__icon-wrap">{icon}</div>
                </div>
                <div className="stat-card__label">{label}</div>
                <div className="stat-card__value">{value}</div>
                <div className="stat-card__sub">{sub}</div>
                {trend && trendVal && (
                    <div className={`stat-card__trend stat-card__trend--${trend}`}>
                        {trend === "up" ? <TrendingUpOutlinedIcon sx={{ fontSize: 14 }} /> : <TrendingDownOutlinedIcon sx={{ fontSize: 14 }} />}
                        {trendVal}
                    </div>
                )}
            </div>
        </div>
    );
}

function CircularGauge({
    value, size, strokeWidth, color, label,
}: {
    value: number; size: number; strokeWidth: number; color: string; label: string;
}) {
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (value / 100) * circumference;

    return (
        <div className="gauge" style={{ width: size, height: size }}>
            <svg className="gauge__svg" width={size} height={size}>
                <circle className="gauge__track" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth} />
                <circle className="gauge__fill" cx={size / 2} cy={size / 2} r={radius} strokeWidth={strokeWidth}
                    stroke={color} strokeDasharray={circumference} strokeDashoffset={offset} />
            </svg>
            <div className="gauge__label">
                <span className="gauge__value">{value}%</span>
                <span className="gauge__text">{label}</span>
            </div>
        </div>
    );
}

function SegmentedBar({ segments }: { segments: { value: number; color: string; label: string }[] }) {
    const total = segments.reduce((acc, s) => acc + s.value, 0) || 1;
    return (
        <div>
            <div className="seg-bar" style={{ marginBottom: "var(--s-3)" }}>
                {segments.map((seg, i) => (
                    <div key={i} className="seg-bar__segment" style={{
                        width: `${(seg.value / total) * 100}%`,
                        background: seg.color,
                        borderRadius: i === 0 ? "var(--r-pill) 0 0 var(--r-pill)" : i === segments.length - 1 ? "0 var(--r-pill) var(--r-pill) 0" : "0",
                    }} />
                ))}
            </div>
            <div style={{ display: "flex", gap: "var(--s-4)" }}>
                {segments.map((seg, i) => (
                    <div key={i} style={{ display: "flex", alignItems: "center", gap: 4, fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                        <span style={{ width: 8, height: 8, borderRadius: "var(--r-pill)", background: seg.color, flexShrink: 0 }} />
                        {seg.label}
                    </div>
                ))}
            </div>
        </div>
    );
}

function MiniStat({ label, value, color, total }: { label: string; value: number; color: string; total: number }) {
    const pct = total > 0 ? Math.round((value / total) * 100) : 0;
    return (
        <div>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
                <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>{label}</span>
                <span className="font-tabular" style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text)" }}>{value}</span>
            </div>
            <div className="progress">
                <div className="progress__fill" style={{ width: `${pct}%`, background: color }} />
            </div>
        </div>
    );
}

function AuditTimeline({
    title, period, steps, activeIndex,
}: {
    title: string; period: string; steps: string[]; activeIndex: number;
}) {
    return (
        <div className="audit-timeline" style={{ borderRight: "1px solid var(--c-border-subtle)" }}>
            <div className="audit-timeline__header">
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                    <VerifiedUserOutlinedIcon sx={{ fontSize: 16 }} />
                    <span className="audit-timeline__title">{title}</span>
                </div>
            </div>
            <div className="audit-timeline__steps">
                {steps.map((_, i) => (
                    <div
                        key={i}
                        className={`audit-timeline__step audit-timeline__step--${i < activeIndex ? "done" : i === activeIndex ? "active" : "pending"}`}
                    />
                ))}
            </div>
            <div className="audit-timeline__labels">
                {steps.map((s) => <span key={s}>{s}</span>)}
            </div>
            <div style={{ marginTop: "var(--s-2)", fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                Period: {period}
            </div>
        </div>
    );
}

function IntegrationSummaryPill({ count, label }: { count: number; label: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
            <span style={{ width: 8, height: 8, borderRadius: "var(--r-pill)", background: "var(--c-text-muted)", flexShrink: 0 }} />
            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>
                <strong style={{ color: "var(--c-text)", fontWeight: "var(--fw-semibold)" }}>{count}</strong> {label}
            </span>
        </div>
    );
}

type RecentItem = {
    type: string;
    title: string;
    badge: string;
    badgeClass: string;
    icon: AppIconComponent;
};

const AUDIT_EVENT_META: Record<string, { type: string; badge: string; badgeClass: string; icon: AppIconComponent }> = {
    system_created:        { type: "System",  badge: "Created",      badgeClass: "badge--live",    icon: MemoryOutlinedIcon },
    system_updated:        { type: "System",  badge: "Updated",      badgeClass: "badge--info",    icon: MemoryOutlinedIcon },
    system_deleted:        { type: "System",  badge: "Deleted",      badgeClass: "badge--danger",  icon: MemoryOutlinedIcon },
    risk_tier_changed:     { type: "Risk",    badge: "Tier Changed", badgeClass: "badge--warning", icon: GppMaybeOutlinedIcon },
    policy_mapping_changed:{ type: "Policy",  badge: "Updated",      badgeClass: "badge--info",    icon: DescriptionOutlinedIcon },
};

function buildRecentlyViewed(
    systems: { name: string; status: string; risk_tier: string | null }[],
    auditEvents: { event_type: string; summary: string; timestamp: string }[],
): RecentItem[] {
    const items: RecentItem[] = [];

    // Build from real audit events (most recent first)
    const sorted = [...auditEvents].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime(),
    );

    sorted.forEach((ev) => {
        const meta = AUDIT_EVENT_META[ev.event_type];
        if (meta && ev.summary) {
            items.push({ type: meta.type, title: ev.summary, badge: meta.badge, badgeClass: meta.badgeClass, icon: meta.icon });
        }
    });

    // Fill remaining slots with registered systems
    systems.forEach((s) => {
        items.push({
            type: "System",
            title: s.name,
            badge: s.status,
            badgeClass: s.status === "Active" ? "badge--live" : "badge--neutral",
            icon: MemoryOutlinedIcon,
        });
    });

    return items.slice(0, 8);
}

function formatRelativeTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(diff / 60_000);
    if (mins < 1) return "just now";
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours}h ago`;
    return `${Math.floor(hours / 24)}d ago`;
}
