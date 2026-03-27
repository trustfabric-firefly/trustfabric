"use client";

import { useState, useCallback, useMemo } from "react";
import DocumentScannerOutlinedIcon from "@mui/icons-material/DocumentScannerOutlined";
import PlayArrowOutlinedIcon from "@mui/icons-material/PlayArrowOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import CancelOutlinedIcon from "@mui/icons-material/CancelOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ChevronRightOutlinedIcon from "@mui/icons-material/ChevronRightOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import TrendingUpOutlinedIcon from "@mui/icons-material/TrendingUpOutlined";
import TrendingDownOutlinedIcon from "@mui/icons-material/TrendingDownOutlined";
import RemoveOutlinedIcon from "@mui/icons-material/RemoveOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import TipsAndUpdatesOutlinedIcon from "@mui/icons-material/TipsAndUpdatesOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import { TopBar } from "@/components/layout/TopBar";
import type {
    ScanResult,
    ScanProgress,
    ScanViolation,
    PolicySeverity,
    ScanScope,
} from "@/types";


const SCAN_STEPS = [
    "Connected to GitHub API",
    "Retrieved organization settings",
    "Fetched Copilot configuration",
    "Analyzing AI model availability",
    "Checking IDE/CLI feature settings",
    "Running AI compliance analysis",
    "Calculating risk scores",
];

const MOCK_ORGS = [
    { id: "acme-corp", name: "acme-corp", repos: 47, teams: 12 },
    { id: "startup-io", name: "startup-io", repos: 23, teams: 5 },
];

const MOCK_POLICIES = [
    { id: "pol_001", name: "Restrict AI Models", severity: "high" as PolicySeverity },
    { id: "pol_002", name: "Disable Copilot CLI", severity: "medium" as PolicySeverity },
    { id: "pol_003", name: "Require Code Review for AI Code", severity: "medium" as PolicySeverity },
];

const MOCK_SCAN_HISTORY: ScanResult[] = [
    {
        scan_id: "scan_004",
        organization: "acme-corp",
        timestamp: "2026-02-16T14:35:00Z",
        config: { scope: "organization", policies_checked: ["pol_001", "pol_002", "pol_003"], github_org: "acme-corp" },
        github_config: { enabled_models: ["gpt-4", "claude-sonnet-3.5"], cli_enabled: true, ide_features: { suggestions: true }, secret_scanning_enabled: true, code_review_required: true },
        results: {
            compliance_score: 67,
            total_policies: 3,
            violations: [
                { policy_id: "pol_001", policy_name: "Restrict AI Models", status: "violation", severity: "high", evidence: "GPT-4 found in enabled_models", recommendation: "Remove GPT-4 from org settings", risk_score: 85 },
                { policy_id: "pol_002", policy_name: "Disable Copilot CLI", status: "violation", severity: "medium", evidence: "cli_enabled: true", recommendation: "Disable CLI in settings", risk_score: 60 },
            ],
            compliant: [
                { policy_id: "pol_003", policy_name: "Require Code Review for AI Code", status: "compliant", severity: "medium", evidence: "All repos have required reviewers configured", recommendation: "", risk_score: 0 },
            ],
        },
        duration_seconds: 28,
        triggered_by: "admin@trustfabric.io",
        status: "completed",
    },
    {
        scan_id: "scan_003",
        organization: "acme-corp",
        timestamp: "2026-02-15T09:15:00Z",
        config: { scope: "organization", policies_checked: ["pol_001", "pol_002", "pol_003"], github_org: "acme-corp" },
        github_config: { enabled_models: ["claude-sonnet-3.5"], cli_enabled: false, ide_features: { suggestions: true }, secret_scanning_enabled: true, code_review_required: true },
        results: {
            compliance_score: 100, total_policies: 3, violations: [], compliant: [
                { policy_id: "pol_001", policy_name: "Restrict AI Models", status: "compliant", severity: "high", evidence: "Only approved models enabled", recommendation: "", risk_score: 0 },
                { policy_id: "pol_002", policy_name: "Disable Copilot CLI", status: "compliant", severity: "medium", evidence: "CLI features disabled", recommendation: "", risk_score: 0 },
                { policy_id: "pol_003", policy_name: "Require Code Review for AI Code", status: "compliant", severity: "medium", evidence: "All repos have required reviewers configured", recommendation: "", risk_score: 0 },
            ]
        },
        duration_seconds: 31,
        triggered_by: "admin@trustfabric.io",
        status: "completed",
    },
    {
        scan_id: "scan_002",
        organization: "acme-corp",
        timestamp: "2026-02-14T15:45:00Z",
        config: { scope: "organization", policies_checked: ["pol_001", "pol_002", "pol_003"], github_org: "acme-corp" },
        github_config: { enabled_models: ["gpt-4", "gpt-4-turbo", "claude-sonnet-3.5"], cli_enabled: true, ide_features: { suggestions: true }, secret_scanning_enabled: false, code_review_required: false },
        results: {
            compliance_score: 33,
            total_policies: 3,
            violations: [
                { policy_id: "pol_001", policy_name: "Restrict AI Models", status: "violation", severity: "high", evidence: "GPT-4 and GPT-4 Turbo found in enabled_models", recommendation: "Remove GPT-4 variants from org settings", risk_score: 90 },
                { policy_id: "pol_002", policy_name: "Disable Copilot CLI", status: "violation", severity: "medium", evidence: "cli_enabled: true", recommendation: "Disable CLI in settings", risk_score: 60 },
            ],
            compliant: [
                { policy_id: "pol_003", policy_name: "Require Code Review for AI Code", status: "compliant", severity: "medium", evidence: "All repos have required reviewers configured", recommendation: "", risk_score: 0 },
            ],
        },
        duration_seconds: 29,
        triggered_by: "security@trustfabric.io",
        status: "completed",
    },
    {
        scan_id: "scan_001",
        organization: "acme-corp",
        timestamp: "2026-02-10T11:20:00Z",
        config: { scope: "organization", policies_checked: ["pol_001", "pol_002", "pol_003"], github_org: "acme-corp" },
        github_config: { enabled_models: ["gpt-4"], cli_enabled: true, ide_features: { suggestions: true }, secret_scanning_enabled: false, code_review_required: false },
        results: {
            compliance_score: 50,
            total_policies: 3,
            violations: [
                { policy_id: "pol_001", policy_name: "Restrict AI Models", status: "violation", severity: "high", evidence: "GPT-4 found in enabled_models", recommendation: "Remove GPT-4 from org settings", risk_score: 85 },
            ],
            compliant: [
                { policy_id: "pol_002", policy_name: "Disable Copilot CLI", status: "compliant", severity: "medium", evidence: "CLI features disabled", recommendation: "", risk_score: 0 },
                { policy_id: "pol_003", policy_name: "Require Code Review for AI Code", status: "compliant", severity: "medium", evidence: "All repos have required reviewers configured", recommendation: "", risk_score: 0 },
            ],
        },
        duration_seconds: 27,
        triggered_by: "admin@trustfabric.io",
        status: "completed",
    },
];


type PageView = "main" | "config" | "scanning" | "results" | "trends";

export default function ScansPage() {
    const [view, setView] = useState<PageView>("main");
    const [scanHistory, setScanHistory] = useState<ScanResult[]>(MOCK_SCAN_HISTORY);
    const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
    const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
    const [selectedScan, setSelectedScan] = useState<ScanResult | null>(null);

    // Configuration state
    const [configOrg, setConfigOrg] = useState(MOCK_ORGS[0].id);
    const [configScope, setConfigScope] = useState<ScanScope>("organization");
    const [configPolicies, setConfigPolicies] = useState<string[]>(MOCK_POLICIES.map(p => p.id));

    const hasScans = scanHistory.length > 0;
    const latestScan = scanHistory[0] ?? null;

    const handleStartConfig = useCallback(() => {
        setView("config");
    }, []);

    const handleCancelConfig = useCallback(() => {
        setView("main");
    }, []);

    const handleStartScan = useCallback(() => {
        setView("scanning");
        setScanProgress({
            step: SCAN_STEPS[0],
            percentage: 0,
            completed_steps: [],
            current_step: SCAN_STEPS[0],
            pending_steps: SCAN_STEPS.slice(1),
        });

        // Simulate scan progress
        let stepIndex = 0;
        const interval = setInterval(() => {
            stepIndex++;
            if (stepIndex < SCAN_STEPS.length) {
                setScanProgress({
                    step: SCAN_STEPS[stepIndex],
                    percentage: Math.round((stepIndex / SCAN_STEPS.length) * 100),
                    completed_steps: SCAN_STEPS.slice(0, stepIndex),
                    current_step: SCAN_STEPS[stepIndex],
                    pending_steps: SCAN_STEPS.slice(stepIndex + 1),
                });
            } else {
                clearInterval(interval);
                // Generate mock result
                const hasViolations = Math.random() > 0.3;
                const newScan: ScanResult = {
                    scan_id: `scan_${Date.now()}`,
                    organization: configOrg,
                    timestamp: new Date().toISOString(),
                    config: {
                        scope: configScope,
                        policies_checked: configPolicies,
                        github_org: configOrg,
                    },
                    github_config: {
                        enabled_models: hasViolations ? ["gpt-4", "claude-sonnet-3.5"] : ["claude-sonnet-3.5"],
                        cli_enabled: hasViolations,
                        ide_features: { suggestions: true },
                        secret_scanning_enabled: true,
                        code_review_required: true,
                    },
                    results: hasViolations ? {
                        compliance_score: 67,
                        total_policies: configPolicies.length,
                        violations: [
                            { policy_id: "pol_001", policy_name: "Restrict AI Models", status: "violation", severity: "high", evidence: "GPT-4 found in enabled_models", recommendation: "Remove GPT-4 from org settings under Copilot configuration.", risk_score: 85 },
                            { policy_id: "pol_002", policy_name: "Disable Copilot CLI", status: "violation", severity: "medium", evidence: "cli_enabled: true", recommendation: "Disable Copilot CLI in organization settings.", risk_score: 60 },
                        ],
                        compliant: [
                            { policy_id: "pol_003", policy_name: "Require Code Review for AI Code", status: "compliant", severity: "medium", evidence: "All repos have required reviewers configured", recommendation: "", risk_score: 0 },
                        ],
                    } : {
                        compliance_score: 100,
                        total_policies: configPolicies.length,
                        violations: [],
                        compliant: MOCK_POLICIES.map(p => ({
                            policy_id: p.id,
                            policy_name: p.name,
                            status: "compliant" as const,
                            severity: p.severity,
                            evidence: "Configuration compliant with policy requirements",
                            recommendation: "",
                            risk_score: 0,
                        })),
                    },
                    duration_seconds: Math.floor(Math.random() * 10) + 25,
                    triggered_by: "dev@local",
                    status: "completed",
                };

                setCurrentScan(newScan);
                setScanHistory(prev => [newScan, ...prev]);
                setView("results");
            }
        }, 800);

        return () => clearInterval(interval);
    }, [configOrg, configScope, configPolicies]);

    const handleViewResults = useCallback((scan: ScanResult) => {
        setSelectedScan(scan);
        setCurrentScan(scan);
        setView("results");
    }, []);

    const handleViewTrends = useCallback(() => {
        setView("trends");
    }, []);

    const handleBackToMain = useCallback(() => {
        setView("main");
        setSelectedScan(null);
        setCurrentScan(null);
    }, []);

    return (
        <>
            <TopBar
                title="Compliance Scans"
                subtitle={hasScans ? `${scanHistory.length} scans completed` : undefined}
                actions={
                    view === "main" && hasScans ? (
                        <div style={{ display: "flex", gap: "var(--s-2)" }}>
                            <button className="btn btn--secondary" onClick={handleViewTrends}>
                                <BarChartOutlinedIcon sx={{ fontSize: 16 }} /> View Trends
                            </button>
                            <button className="btn btn--primary" onClick={handleStartConfig}>
                                <PlayArrowOutlinedIcon sx={{ fontSize: 16 }} /> Run Scan
                            </button>
                        </div>
                    ) : undefined
                }
            />

            <main className="page">
                {view === "main" && (
                    <MainView
                        hasScans={hasScans}
                        latestScan={latestScan}
                        scanHistory={scanHistory}
                        onStartConfig={handleStartConfig}
                        onViewResults={handleViewResults}
                        onViewTrends={handleViewTrends}
                    />
                )}

                {view === "config" && (
                    <ConfigView
                        configOrg={configOrg}
                        setConfigOrg={setConfigOrg}
                        configScope={configScope}
                        setConfigScope={setConfigScope}
                        configPolicies={configPolicies}
                        setConfigPolicies={setConfigPolicies}
                        onCancel={handleCancelConfig}
                        onStart={handleStartScan}
                    />
                )}

                {view === "scanning" && scanProgress && (
                    <ScanningView progress={scanProgress} org={configOrg} />
                )}

                {view === "results" && currentScan && (
                    <ResultsView
                        scan={currentScan}
                        onRunAnother={handleStartConfig}
                        onViewTrends={handleViewTrends}
                        onBack={handleBackToMain}
                    />
                )}

                {view === "trends" && (
                    <TrendsView
                        scanHistory={scanHistory}
                        onBack={handleBackToMain}
                    />
                )}
            </main>
        </>
    );
}


function MainView({
    hasScans,
    latestScan,
    scanHistory,
    onStartConfig,
    onViewResults,
}: {
    hasScans: boolean;
    latestScan: ScanResult | null;
    scanHistory: ScanResult[];
    onStartConfig: () => void;
    onViewResults: (scan: ScanResult) => void;
    onViewTrends: () => void;
}) {
    const [historyFilter, setHistoryFilter] = useState<"all" | "violations" | "compliant">("all");

    const filteredHistory = useMemo(() => {
        if (historyFilter === "all") return scanHistory;
        if (historyFilter === "violations") return scanHistory.filter(s => s.results.violations.length > 0);
        return scanHistory.filter(s => s.results.violations.length === 0);
    }, [scanHistory, historyFilter]);

    if (!hasScans) {
        return (
            <div className="panel">
                <div className="scan-empty">
                    <div className="scan-empty__icon">
                        <DocumentScannerOutlinedIcon sx={{ fontSize: 32 }} />
                    </div>
                    <h2 className="scan-empty__title">Run Your First Scan</h2>
                    <p className="scan-empty__desc">
                        Check your GitHub AI tool configurations against your
                        active policies. Identify compliance gaps and get
                        actionable recommendations.
                    </p>
                    <p className="scan-empty__time">
                        <AccessTimeOutlinedIcon sx={{ fontSize: 16 }} /> Takes ~30 seconds
                    </p>
                    <button className="btn btn--primary btn--lg" onClick={onStartConfig}>
                        <PlayArrowOutlinedIcon sx={{ fontSize: 18 }} /> Run Compliance Scan Now
                    </button>

                    <div className="scan-info">
                        <h4 className="scan-info__title">
                            <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 16 }} /> What happens during a scan?
                        </h4>
                        <ol className="scan-info__list">
                            <li>Connects to GitHub API</li>
                            <li>Retrieves AI configuration (models, features)</li>
                            <li>Compares against your active policies</li>
                            <li>Identifies violations and calculates risk</li>
                        </ol>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            {/* Latest Scan Summary */}
            {latestScan && (
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">Latest Scan Results</span>
                        <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                            {formatDateTime(latestScan.timestamp)}
                        </span>
                    </div>
                    <div className="panel__body">
                        <LatestScanCard scan={latestScan} onViewDetails={() => onViewResults(latestScan)} />
                    </div>
                </div>
            )}

            {/* Scan History */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Scan History</span>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                        <FilterListOutlinedIcon sx={{ fontSize: 16, color: "var(--c-text-muted)" }} />
                        <select
                            className="input"
                            style={{ width: 140, padding: "4px 8px", fontSize: "var(--fs-12)" }}
                            value={historyFilter}
                            onChange={(e) => setHistoryFilter(e.target.value as typeof historyFilter)}
                        >
                            <option value="all">All Scans</option>
                            <option value="violations">With Violations</option>
                            <option value="compliant">Compliant</option>
                        </select>
                    </div>
                </div>
                <div className="panel__body--flush">
                    {filteredHistory.length === 0 ? (
                        <div className="empty-state" style={{ padding: "var(--s-6)" }}>
                            <p className="empty-state__desc">No scans match the filter.</p>
                        </div>
                    ) : (
                        <div className="scan-history">
                            {filteredHistory.map((scan) => (
                                <ScanHistoryItem
                                    key={scan.scan_id}
                                    scan={scan}
                                    onViewResults={() => onViewResults(scan)}
                                />
                            ))}
                        </div>
                    )}
                    <div style={{ padding: "var(--s-3) var(--s-4)", fontSize: "var(--fs-11)", color: "var(--c-text-muted)", borderTop: "1px solid var(--c-border)" }}>
                        Showing {filteredHistory.length} of {scanHistory.length} scans
                    </div>
                </div>
            </div>
        </div>
    );
}


function ConfigView({
    configOrg,
    setConfigOrg,
    configScope,
    setConfigScope,
    configPolicies,
    setConfigPolicies,
    onCancel,
    onStart,
}: {
    configOrg: string;
    setConfigOrg: (v: string) => void;
    configScope: ScanScope;
    setConfigScope: (v: ScanScope) => void;
    configPolicies: string[];
    setConfigPolicies: (v: string[]) => void;
    onCancel: () => void;
    onStart: () => void;
}) {
    const selectedPolicies = MOCK_POLICIES.filter(p => configPolicies.includes(p.id));

    return (
        <div className="panel" style={{ maxWidth: 640 }}>
            <div className="panel__header">
                <span className="panel__title">Configure Compliance Scan</span>
            </div>
            <div className="panel__body" style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", lineHeight: 1.5 }}>
                    Select what to scan and which policies to check against.
                </p>

                <div className="form-group">
                    <label className="form-label">GitHub Organization *</label>
                    <select className="input" value={configOrg} onChange={(e) => setConfigOrg(e.target.value)}>
                        {MOCK_ORGS.map(org => (
                            <option key={org.id} value={org.id}>{org.name}</option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Policies to Check</label>
                    <div className="scan-config__policies">
                        <label className="scan-config__policy-option">
                            <input
                                type="checkbox"
                                checked={configPolicies.length === MOCK_POLICIES.length}
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setConfigPolicies(MOCK_POLICIES.map(p => p.id));
                                    } else {
                                        setConfigPolicies([]);
                                    }
                                }}
                            />
                            <span>All Active Policies ({MOCK_POLICIES.length})</span>
                        </label>
                    </div>
                </div>

                <div className="form-group">
                    <label className="form-label">Scope</label>
                    <div className="scan-config__scope">
                        {(["organization", "repositories", "teams"] as ScanScope[]).map((scope) => (
                            <label key={scope} className="scan-config__scope-option">
                                <input
                                    type="radio"
                                    name="scope"
                                    value={scope}
                                    checked={configScope === scope}
                                    onChange={() => setConfigScope(scope)}
                                />
                                <span>{scope === "organization" ? "Organization-wide" : scope === "repositories" ? "Specific repositories" : "Specific teams"}</span>
                            </label>
                        ))}
                    </div>
                </div>

                <div className="divider" />

                <div className="scan-config__preview">
                    <h4 style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)", color: "var(--c-text)", marginBottom: "var(--s-2)", display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                        <DescriptionOutlinedIcon sx={{ fontSize: 16 }} />
                        Active Policies to be Checked:
                    </h4>
                    <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                        {selectedPolicies.map((p) => (
                            <li key={p.id} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                                <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-text-muted)", flexShrink: 0 }} />
                                {p.name}
                                <span className="badge badge--neutral" style={{ fontSize: "var(--fs-11)" }}>
                                    {p.severity}
                                </span>
                            </li>
                        ))}
                    </ul>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                    <AccessTimeOutlinedIcon sx={{ fontSize: 14 }} />
                    <span>Estimated scan time: ~30 seconds</span>
                </div>

                <div className="divider" />

                <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-2)" }}>
                    <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
                    <button className="btn btn--primary" onClick={onStart} disabled={configPolicies.length === 0}>
                        Start Scan <ChevronRightOutlinedIcon sx={{ fontSize: 16 }} />
                    </button>
                </div>
            </div>
        </div>
    );
}


function ScanningView({ progress, org }: { progress: ScanProgress; org: string }) {
    return (
        <div className="panel" style={{ maxWidth: 560, margin: "0 auto" }}>
            <div className="panel__body">
                <div className="scan-progress">
                    <div className="scan-progress__spinner">
                        <div className="spinner spinner--lg" />
                    </div>
                    <h2 className="scan-progress__title">Running Compliance Scan</h2>

                    <div className="scan-progress__bar-wrap">
                        <div className="progress progress--thick">
                            <div
                                className="progress__fill"
                                style={{
                                    width: `${progress.percentage}%`,
                                    background: "var(--c-accent)",
                                }}
                            />
                        </div>
                        <span className="scan-progress__percentage">{progress.percentage}%</span>
                    </div>

                    <div className="scan-progress__steps">
                        {SCAN_STEPS.map((step) => {
                            const isCompleted = progress.completed_steps.includes(step);
                            const isCurrent = progress.current_step === step;

                            return (
                                <div
                                    key={step}
                                    className={`scan-progress__step ${isCompleted ? "scan-progress__step--done" : isCurrent ? "scan-progress__step--active" : "scan-progress__step--pending"}`}
                                >
                                    <span className="scan-progress__step-icon">
                                        {isCompleted ? <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} /> : isCurrent ? <RefreshOutlinedIcon sx={{ fontSize: 16 }} className="spin" /> : <AccessTimeOutlinedIcon sx={{ fontSize: 16 }} />}
                                    </span>
                                    <span>{step}</span>
                                </div>
                            );
                        })}
                    </div>

                    <div className="scan-progress__meta">
                        <div><strong>Organization:</strong> {org}</div>
                        <div><strong>Policies checked:</strong> {MOCK_POLICIES.length} active policies</div>
                        <div><strong>Started:</strong> {new Date().toLocaleTimeString()}</div>
                    </div>
                </div>
            </div>
        </div>
    );
}


function ResultsView({
    scan,
    onRunAnother,
    onViewTrends,
    onBack,
}: {
    scan: ScanResult;
    onRunAnother: () => void;
    onViewTrends: () => void;
    onBack: () => void;
}) {
    const hasViolations = scan.results.violations.length > 0;
    const highRisk = scan.results.violations.filter(v => v.severity === "high");
    const mediumRisk = scan.results.violations.filter(v => v.severity === "medium");
    const lowRisk = scan.results.violations.filter(v => v.severity === "low");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            {/* Back button */}
            <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ alignSelf: "flex-start", gap: 4 }}>
                <ChevronRightOutlinedIcon sx={{ fontSize: 14, transform: "rotate(180deg)" }} /> Back to Scans
            </button>

            {/* Header Card */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">
                        Scan Results — {formatDateTime(scan.timestamp)}
                    </span>
                </div>
                <div className="panel__body">
                    <div className={`scan-result-header ${hasViolations ? "scan-result-header--violations" : "scan-result-header--compliant"}`}>
                        <div className="scan-result-header__icon">
                            {hasViolations ? <WarningAmberOutlinedIcon sx={{ fontSize: 28 }} /> : <CheckCircleOutlinedIcon sx={{ fontSize: 28 }} />}
                        </div>
                        <div className="scan-result-header__content">
                            <h2 className="scan-result-header__title">
                                {hasViolations ? "Compliance Issues Found" : "All Policies Compliant!"}
                            </h2>
                            <p className="scan-result-header__subtitle">
                                {hasViolations
                                    ? `${scan.results.violations.length} violation${scan.results.violations.length > 1 ? "s" : ""} found (${highRisk.length} High, ${mediumRisk.length} Medium)`
                                    : `No violations found. ${scan.results.total_policies} policies checked, all compliant.`
                                }
                            </p>
                        </div>
                        <div className="scan-result-header__score">
                            <ComplianceGauge score={scan.results.compliance_score} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Violations by Risk Level */}
            {hasViolations && (
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">Violations by Risk Level</span>
                    </div>
                    <div className="panel__body--flush">
                        {highRisk.length > 0 && (
                            <ViolationSection severity="high" violations={highRisk} />
                        )}
                        {mediumRisk.length > 0 && (
                            <ViolationSection severity="medium" violations={mediumRisk} />
                        )}
                        {lowRisk.length > 0 && (
                            <ViolationSection severity="low" violations={lowRisk} />
                        )}
                    </div>
                </div>
            )}

            {/* Compliant Policies */}
            {scan.results.compliant.length > 0 && (
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                            <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />
                            Compliant Policies ({scan.results.compliant.length})
                        </span>
                    </div>
                    <div className="panel__body--flush">
                        {scan.results.compliant.map((policy) => (
                            <div key={policy.policy_id} className="scan-compliant-item">
                                <div className="scan-compliant-item__icon">
                                    <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />
                                </div>
                                <div className="scan-compliant-item__content">
                                    <span className="scan-compliant-item__name">{policy.policy_name}</span>
                                    <span className="scan-compliant-item__evidence">{policy.evidence}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Scan Details */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Scan Details</span>
                </div>
                <div className="panel__body">
                    <div className="scan-details">
                        <div className="scan-details__item">
                            <span className="scan-details__label">Organization</span>
                            <span className="scan-details__value">{scan.organization}</span>
                        </div>
                        <div className="scan-details__item">
                            <span className="scan-details__label">Policies Checked</span>
                            <span className="scan-details__value">{scan.results.total_policies}</span>
                        </div>
                        <div className="scan-details__item">
                            <span className="scan-details__label">Duration</span>
                            <span className="scan-details__value">{scan.duration_seconds} seconds</span>
                        </div>
                        <div className="scan-details__item">
                            <span className="scan-details__label">Scan ID</span>
                            <span className="scan-details__value font-mono">{scan.scan_id}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "flex-end" }}>
                <button className="btn btn--secondary">
                    <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} /> Export Report (PDF)
                </button>
                <button className="btn btn--secondary" onClick={onViewTrends}>
                    <BarChartOutlinedIcon sx={{ fontSize: 16 }} /> View Trends
                </button>
                <button className="btn btn--primary" onClick={onRunAnother}>
                    <RefreshOutlinedIcon sx={{ fontSize: 16 }} /> Run Another Scan
                </button>
            </div>
        </div>
    );
}


function TrendsView({
    scanHistory,
    onBack,
}: {
    scanHistory: ScanResult[];
    onBack: () => void;
}) {
    const sortedScans = useMemo(() =>
        [...scanHistory].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()),
        [scanHistory]
    );

    const latestViolations = scanHistory[0]?.results.violations ?? [];
    const previousViolations = scanHistory[1]?.results.violations ?? [];
    const highRiskTrend = latestViolations.filter(v => v.severity === "high").length - previousViolations.filter(v => v.severity === "high").length;
    const mediumRiskTrend = latestViolations.filter(v => v.severity === "medium").length - previousViolations.filter(v => v.severity === "medium").length;

    // Most common violations
    const violationCounts = useMemo(() => {
        const counts: Record<string, number> = {};
        scanHistory.forEach(scan => {
            scan.results.violations.forEach(v => {
                counts[v.policy_name] = (counts[v.policy_name] ?? 0) + 1;
            });
        });
        return Object.entries(counts)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 3);
    }, [scanHistory]);

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ alignSelf: "flex-start", gap: 4 }}>
                <ChevronRightOutlinedIcon sx={{ fontSize: 14, transform: "rotate(180deg)" }} /> Back to Scans
            </button>

            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Compliance Trends</span>
                </div>
                <div className="panel__body">
                    {/* Simple ASCII-style chart visualization */}
                    <div className="trends-chart">
                        <div className="trends-chart__title">Compliance Score Over Time</div>
                        <div className="trends-chart__bars">
                            {sortedScans.map((scan) => (
                                <div key={scan.scan_id} className="trends-chart__bar-wrap">
                                    <div
                                        className="trends-chart__bar"
                                        style={{
                                            height: `${scan.results.compliance_score}%`,
                                            background: scan.results.compliance_score === 100
                                                ? "var(--c-live)"
                                                : scan.results.compliance_score >= 70
                                                    ? "var(--c-medium)"
                                                    : "var(--c-critical)",
                                        }}
                                    >
                                        <span className="trends-chart__bar-value">{scan.results.compliance_score}%</span>
                                    </div>
                                    <span className="trends-chart__bar-label">
                                        {formatShortDate(scan.timestamp)}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </div>

                    <div className="divider" />

                    {/* Trend indicators */}
                    <div className="trends-indicators">
                        <div className="trends-indicator">
                            <span className="trends-indicator__label">High Risk</span>
                            <span className={`trends-indicator__value ${highRiskTrend < 0 ? "trends-indicator__value--improving" : highRiskTrend > 0 ? "trends-indicator__value--worsening" : ""}`}>
                                {highRiskTrend < 0 ? <TrendingDownOutlinedIcon sx={{ fontSize: 16 }} /> : highRiskTrend > 0 ? <TrendingUpOutlinedIcon sx={{ fontSize: 16 }} /> : <RemoveOutlinedIcon sx={{ fontSize: 16 }} />}
                                {highRiskTrend < 0 ? `${Math.abs(highRiskTrend * 50)}% Improving` : highRiskTrend > 0 ? `${highRiskTrend * 50}% Worsening` : "No change"}
                            </span>
                        </div>
                        <div className="trends-indicator">
                            <span className="trends-indicator__label">Medium Risk</span>
                            <span className={`trends-indicator__value ${mediumRiskTrend < 0 ? "trends-indicator__value--improving" : mediumRiskTrend > 0 ? "trends-indicator__value--worsening" : ""}`}>
                                {mediumRiskTrend < 0 ? <TrendingDownOutlinedIcon sx={{ fontSize: 16 }} /> : mediumRiskTrend > 0 ? <TrendingUpOutlinedIcon sx={{ fontSize: 16 }} /> : <RemoveOutlinedIcon sx={{ fontSize: 16 }} />}
                                {mediumRiskTrend < 0 ? `${Math.abs(mediumRiskTrend * 50)}% Improving` : mediumRiskTrend > 0 ? `${mediumRiskTrend * 50}% Worsening` : "No change"}
                            </span>
                        </div>
                    </div>

                    <div className="divider" />

                    {/* Most common violations */}
                    <div className="trends-violations">
                        <h4 style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)", color: "var(--c-text)", marginBottom: "var(--s-3)" }}>
                            Most Common Violations
                        </h4>
                        {violationCounts.length === 0 ? (
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>No violations recorded.</p>
                        ) : (
                            <ol style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                                {violationCounts.map(([name, count], i) => (
                                    <li key={name} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                                        <span style={{ width: 20, height: 20, borderRadius: "var(--r-sm)", background: "var(--c-surface-raised)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)", color: "var(--c-text-muted)" }}>
                                            {i + 1}
                                        </span>
                                        <span style={{ flex: 1 }}>{name}</span>
                                        <span style={{ fontWeight: "var(--fw-semibold)", color: "var(--c-text)" }}>{count} occurrences</span>
                                    </li>
                                ))}
                            </ol>
                        )}
                    </div>
                </div>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn--secondary">
                    <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} /> Export Chart (PNG)
                </button>
            </div>
        </div>
    );
}

function LatestScanCard({ scan, onViewDetails }: { scan: ScanResult; onViewDetails: () => void }) {
    const hasViolations = scan.results.violations.length > 0;
    const highCount = scan.results.violations.filter(v => v.severity === "high").length;
    const mediumCount = scan.results.violations.filter(v => v.severity === "medium").length;

    return (
        <div className="latest-scan-card">
            <div className="latest-scan-card__gauge">
                <ComplianceGauge score={scan.results.compliance_score} />
            </div>
            <div className="latest-scan-card__content">
                <div className="latest-scan-card__status">
                    {hasViolations ? (
                        <span className="badge badge--warning">
                            <WarningAmberOutlinedIcon sx={{ fontSize: 12 }} /> {scan.results.violations.length} Violations
                        </span>
                    ) : (
                        <span className="badge badge--live">
                            <CheckCircleOutlinedIcon sx={{ fontSize: 12 }} /> All Compliant
                        </span>
                    )}
                </div>
                <div className="latest-scan-card__summary">
                    {hasViolations
                        ? `${highCount} High, ${mediumCount} Medium risk issues found`
                        : `${scan.results.total_policies} policies checked, all passing`
                    }
                </div>
                <div className="latest-scan-card__meta">
                    <span><BusinessOutlinedIcon sx={{ fontSize: 14 }} /> {scan.organization}</span>
                    <span><AccessTimeOutlinedIcon sx={{ fontSize: 14 }} /> {scan.duration_seconds}s</span>
                </div>
            </div>
            <button className="btn btn--secondary" onClick={onViewDetails}>
                View Details <ChevronRightOutlinedIcon sx={{ fontSize: 16 }} />
            </button>
        </div>
    );
}

function ScanHistoryItem({ scan, onViewResults }: { scan: ScanResult; onViewResults: () => void }) {
    const hasViolations = scan.results.violations.length > 0;
    const highCount = scan.results.violations.filter(v => v.severity === "high").length;
    const mediumCount = scan.results.violations.filter(v => v.severity === "medium").length;
    const lowCount = scan.results.violations.filter(v => v.severity === "low").length;

    return (
        <div className="scan-history-item" onClick={onViewResults}>
            <div className="scan-history-item__icon">
                <DocumentScannerOutlinedIcon sx={{ fontSize: 18 }} />
            </div>
            <div className="scan-history-item__content">
                <div className="scan-history-item__date">{formatDateTime(scan.timestamp)}</div>
                <div className="scan-history-item__summary">
                    {hasViolations
                        ? `${scan.results.violations.length} violation${scan.results.violations.length > 1 ? "s" : ""} (${highCount > 0 ? `${highCount} High` : ""}${highCount > 0 && mediumCount > 0 ? ", " : ""}${mediumCount > 0 ? `${mediumCount} Medium` : ""}${(highCount > 0 || mediumCount > 0) && lowCount > 0 ? ", " : ""}${lowCount > 0 ? `${lowCount} Low` : ""})`
                        : "No violations found"
                    }
                </div>
                <div className="scan-history-item__meta">
                    <span>Scanned: {scan.organization}</span>
                    <span>Duration: {scan.duration_seconds}s</span>
                </div>
            </div>
            <div className="scan-history-item__score">
                <span className={`scan-history-item__score-value ${scan.results.compliance_score === 100 ? "scan-history-item__score-value--perfect" : scan.results.compliance_score >= 70 ? "" : "scan-history-item__score-value--low"}`}>
                    {scan.results.compliance_score}%
                </span>
                <span className="scan-history-item__score-label">Compliant</span>
            </div>
            <div className="scan-history-item__actions">
                <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); onViewResults(); }}>View Results</button>
                <button className="btn btn--ghost btn--sm" onClick={(e) => e.stopPropagation()}>Export PDF</button>
            </div>
            <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: "var(--c-text-muted)", flexShrink: 0 }} />
        </div>
    );
}

function ViolationSection({ severity, violations }: { severity: PolicySeverity; violations: ScanViolation[] }) {
    const severityConfig = {
        high: { label: "HIGH RISK", icon: CancelOutlinedIcon },
        medium: { label: "MEDIUM RISK", icon: WarningAmberOutlinedIcon },
        low: { label: "LOW RISK", icon: VisibilityOutlinedIcon },
    };

    const config = severityConfig[severity];
    const Icon = config.icon;

    return (
        <div className="violation-section">
            <div className="violation-section__header">
                <Icon sx={{ fontSize: 16 }} />
                <span>{config.label} ({violations.length})</span>
            </div>
            {violations.map((v) => (
                <div key={v.policy_id} className="violation-card">
                    <div className="violation-card__header">
                        <div className="violation-card__icon">
                            <DescriptionOutlinedIcon sx={{ fontSize: 16 }} />
                        </div>
                        <div className="violation-card__title">
                            <span className="violation-card__policy">Policy: {v.policy_name}</span>
                            <span className="violation-card__status">
                                <CancelOutlinedIcon sx={{ fontSize: 14 }} /> VIOLATION
                            </span>
                        </div>
                    </div>
                    <div className="violation-card__issue">
                        <strong>Issue:</strong> {v.evidence}
                    </div>
                    <div className="violation-card__evidence">
                        <strong>Evidence:</strong>
                        <ul>
                            <li>{v.evidence}</li>
                        </ul>
                    </div>
                    <div className="violation-card__recommendation">
                        <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                        <div>
                            <strong>Recommended Fix:</strong>
                            <p>{v.recommendation}</p>
                        </div>
                    </div>
                    <div className="violation-card__actions">
                        <button className="btn btn--ghost btn--sm">View Details</button>
                        <button className="btn btn--ghost btn--sm">Mark as Acknowledged</button>
                    </div>
                </div>
            ))}
        </div>
    );
}

function ComplianceGauge({ score }: { score: number }) {
    const size = 100;
    const strokeWidth = 8;
    const radius = (size - strokeWidth) / 2;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;
    const color = score === 100 ? "var(--c-live)" : score >= 70 ? "var(--c-medium)" : "var(--c-critical)";

    return (
        <div className="compliance-gauge" style={{ width: size, height: size }}>
            <svg width={size} height={size} style={{ transform: "rotate(-90deg)" }}>
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke="var(--c-surface-raised)"
                    strokeWidth={strokeWidth}
                />
                <circle
                    cx={size / 2}
                    cy={size / 2}
                    r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth={strokeWidth}
                    strokeLinecap="round"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    style={{ transition: "stroke-dashoffset 0.8s ease" }}
                />
            </svg>
            <div className="compliance-gauge__label">
                <span className="compliance-gauge__value">{score}%</span>
                <span className="compliance-gauge__text">Compliant</span>
            </div>
        </div>
    );
}

function formatDateTime(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso));
}

function formatShortDate(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
    }).format(new Date(iso));
}
