"use client";
import { DocumentScannerOutlinedIcon, PlayArrowOutlinedIcon, CheckCircleOutlinedIcon, WarningAmberOutlinedIcon, CancelOutlinedIcon, AccessTimeOutlinedIcon, BusinessOutlinedIcon, DescriptionOutlinedIcon, ChevronRightOutlinedIcon, FileDownloadOutlinedIcon, RefreshOutlinedIcon, TrendingUpOutlinedIcon, TrendingDownOutlinedIcon, RemoveOutlinedIcon, FilterListOutlinedIcon, BarChartOutlinedIcon, TipsAndUpdatesOutlinedIcon, VisibilityOutlinedIcon, CloudOutlinedIcon } from "@/lib/icons";

import { useState, useCallback, useMemo, useRef, useEffect, type ReactNode } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { scansApi, awsScansApi, integrationsApi } from "@/lib/api";
import { Modal } from "@/components/ui/Modal";
import { PageEmptyIllustration } from "@/components/ui/PageEmptyIllustration";
import { TopBar } from "@/components/layout/TopBar";
import { IntegrationsHub } from "@/components/scans/IntegrationsHub";
import { FigmaBrandScanPanel } from "@/components/scans/FigmaBrandScanPanel";
import { isScanAppId } from "@/lib/scan-integrations";
import "./scans-config.css";
import "./scans-hub.css";
import type {
    ScanResult,
    ScanProgress,
    ScanViolation,
    PolicySeverity,
    ScanScope,
    AwsScanResult,
    AwsCheckResult,
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

type PageView = "main" | "config" | "scanning" | "results" | "trends";

export default function ScansPage() {
    const queryClient = useQueryClient();
    const router = useRouter();
    const searchParams = useSearchParams();
    const activeAppParam = searchParams.get("app");
    const activeApp = isScanAppId(activeAppParam) ? activeAppParam : null;
    const [view, setView] = useState<PageView>("main");
    const [currentScan, setCurrentScan] = useState<ScanResult | null>(null);
    const [scanProgress, setScanProgress] = useState<ScanProgress | null>(null);
    const [selectedScan, setSelectedScan] = useState<ScanResult | null>(null);
    const [scanError, setScanError] = useState<string | null>(null);
    const [trendSourceScanId, setTrendSourceScanId] = useState<string | null>(null);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const { data: githubStatus } = useQuery({
        queryKey: ["github-status"],
        queryFn: integrationsApi.getGitHubStatus,
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

    const { data: scanHistory = [] } = useQuery({
        queryKey: ["scans"],
        queryFn: scansApi.list,
        retry: false,
    });

    const { data: awsScanHistory = [], refetch: refetchAwsScans } = useQuery({
        queryKey: ["aws-scans"],
        queryFn: awsScansApi.list,
        retry: false,
    });

    const [awsScanning, setAwsScanning] = useState(false);
    const [awsScanError, setAwsScanError] = useState<string | null>(null);
    const [selectedAwsScan, setSelectedAwsScan] = useState<AwsScanResult | null>(null);

    const handleAwsScan = useCallback(async () => {
        setAwsScanning(true);
        setAwsScanError(null);
        try {
            const result = await awsScansApi.trigger();
            void refetchAwsScans();
            setSelectedAwsScan(result);
        } catch (err) {
            setAwsScanError(err instanceof Error ? err.message : "AWS scan failed");
        }
        setAwsScanning(false);
    }, [refetchAwsScans]);

    const githubLogin = githubStatus?.user?.login ?? "";

    // Configuration state
    const [configOrg, setConfigOrg] = useState("");
    const [configScope, setConfigScope] = useState<ScanScope>("repositories");
    const [configPolicies, setConfigPolicies] = useState<string[]>(["chk_branch_protection", "chk_pr_reviews", "chk_vulnerability_alerts", "chk_actions_restricted"]);

    const hasScans = scanHistory.length > 0;
    const latestScan = scanHistory[0] ?? null;
    const requestedScanId = searchParams.get("scanId");
    const requestedStart = searchParams.get("start");

    const goToHub = useCallback(() => {
        router.push("/scans");
    }, [router]);

    useEffect(() => {
        if ((requestedScanId || requestedStart) && !activeApp) {
            const params = new URLSearchParams(searchParams.toString());
            params.set("app", "github");
            router.replace(`/scans?${params.toString()}`);
        }
    }, [requestedScanId, requestedStart, activeApp, searchParams, router]);

    useEffect(() => {
        if (requestedStart === "config" && (activeApp === "github" || !activeApp)) {
            setView("config");
            if (!configOrg) {
                const saved = localStorage.getItem("tf_default_github_org");
                setConfigOrg(saved || githubLogin);
            }
        }
    }, [requestedStart, activeApp, configOrg, githubLogin]);

    useEffect(() => {
        if (!requestedScanId || scanHistory.length === 0) return;
        const match = scanHistory.find((scan) => scan.scan_id === requestedScanId);
        if (!match) return;
        setSelectedScan(match);
        setCurrentScan(match);
        setView("results");
    }, [requestedScanId, scanHistory]);

    // Pre-fill org: saved default → GitHub login → empty
    const handleStartConfig = useCallback(() => {
        if (!configOrg) {
            const saved = localStorage.getItem("tf_default_github_org");
            setConfigOrg(saved || githubLogin);
        }
        setView("config");
    }, [configOrg, githubLogin]);

    const handleCancelConfig = useCallback(() => {
        setView("main");
    }, []);

    const handleStartScan = useCallback(async () => {
        const org = configOrg || githubLogin;
        if (!org) return;
        setScanError(null);
        setView("scanning");

        // Animate progress steps while the real API call runs in parallel
        let stepIndex = 0;
        setScanProgress({
            step: SCAN_STEPS[0],
            percentage: 0,
            completed_steps: [],
            current_step: SCAN_STEPS[0],
            pending_steps: SCAN_STEPS.slice(1),
        });
        intervalRef.current = setInterval(() => {
            stepIndex = Math.min(stepIndex + 1, SCAN_STEPS.length - 1);
            setScanProgress({
                step: SCAN_STEPS[stepIndex],
                percentage: Math.round((stepIndex / (SCAN_STEPS.length - 1)) * 90),
                completed_steps: SCAN_STEPS.slice(0, stepIndex),
                current_step: SCAN_STEPS[stepIndex],
                pending_steps: SCAN_STEPS.slice(stepIndex + 1),
            });
        }, 1200);

        try {
            const result = await scansApi.trigger({ github_org: org, scope: configScope });
            if (intervalRef.current) clearInterval(intervalRef.current);
            setScanProgress({ step: "Done", percentage: 100, completed_steps: SCAN_STEPS, current_step: "Done", pending_steps: [] });
            setCurrentScan(result);
            void queryClient.invalidateQueries({ queryKey: ["scans"] });
            setView("results");
        } catch (err) {
            if (intervalRef.current) clearInterval(intervalRef.current);
            setScanError(err instanceof Error ? err.message : "Scan failed");
            setView("config");
        }
    }, [configOrg, configScope, githubLogin, queryClient]);

    const handleViewResults = useCallback((scan: ScanResult) => {
        setSelectedScan(scan);
        setCurrentScan(scan);
        setView("results");
    }, []);

    const handleViewTrends = useCallback(() => {
        setTrendSourceScanId(currentScan?.scan_id ?? null);
        setView("trends");
    }, [currentScan]);

    const handleBackToMain = useCallback(() => {
        setView("main");
        setSelectedScan(null);
        setCurrentScan(null);
        setTrendSourceScanId(null);
    }, []);

    const handleBackFromTrends = useCallback(() => {
        if (trendSourceScanId) {
            const match = scanHistory.find((scan) => scan.scan_id === trendSourceScanId);
            if (match) {
                setSelectedScan(match);
                setCurrentScan(match);
                setView("results");
                return;
            }
        }
        setView("main");
    }, [scanHistory, trendSourceScanId]);

    const handleExportReport = useCallback(async (scanId: string) => {
        const html = await scansApi.getReportHtml(scanId);
        const popup = window.open("", "_blank", "noopener,noreferrer");
        if (!popup) {
            throw new Error("Popup blocked while opening the report preview.");
        }
        popup.document.open();
        popup.document.write(html);
        popup.document.close();
        popup.focus();
        window.setTimeout(() => {
            popup.print();
        }, 300);
    }, []);

    const hubView = !activeApp;
    const isGithub = activeApp === "github";
    const isAws = activeApp === "aws";
    const isFigma = activeApp === "figma";

    let topBarTitle = "Integrations";
    let topBarSubtitle: string | undefined = "Run compliance scans across your connected apps";
    let topBarActions: ReactNode;

    if (isGithub) {
        topBarTitle = "GitHub";
        topBarSubtitle =
            view === "config"
                ? "Set organization, scope, and checks"
                : hasScans
                    ? `${scanHistory.length} scans completed`
                    : "Repository governance scans";
        topBarActions = (
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
                <button type="button" className="btn btn--secondary" onClick={goToHub}>
                    All integrations
                </button>
                {view === "config" ? (
                    <>
                        <button type="button" className="btn btn--secondary" onClick={handleCancelConfig}>
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn--primary"
                            onClick={() => void handleStartScan()}
                            disabled={configPolicies.length === 0}
                        >
                            <PlayArrowOutlinedIcon sx={{ fontSize: 16 }} /> Start Scan
                        </button>
                    </>
                ) : view === "main" ? (
                    hasScans ? (
                        <>
                            <button type="button" className="btn btn--secondary" onClick={handleViewTrends}>
                                <BarChartOutlinedIcon sx={{ fontSize: 16 }} /> View Trends
                            </button>
                            <button type="button" className="btn btn--primary" onClick={handleStartConfig}>
                                <PlayArrowOutlinedIcon sx={{ fontSize: 16 }} /> Run Scan
                            </button>
                        </>
                    ) : (
                        <button type="button" className="btn btn--primary" onClick={handleStartConfig}>
                            <PlayArrowOutlinedIcon sx={{ fontSize: 16 }} /> Run Scan
                        </button>
                    )
                ) : null}
            </div>
        );
    } else if (isAws) {
        topBarTitle = "AWS";
        topBarSubtitle = awsStatus?.connected
            ? `Account ${awsStatus.info?.account_id ?? ""} · ${awsStatus.info?.region ?? "us-east-1"}`
            : "Infrastructure compliance scans";
        topBarActions = (
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
                <button type="button" className="btn btn--secondary" onClick={goToHub}>
                    All integrations
                </button>
                {awsStatus?.connected && !selectedAwsScan && (
                    <button
                        type="button"
                        className="btn btn--primary"
                        onClick={() => void handleAwsScan()}
                        disabled={awsScanning}
                    >
                        <PlayArrowOutlinedIcon sx={{ fontSize: 16 }} />
                        {awsScanning ? "Scanning…" : "Run AWS Scan"}
                    </button>
                )}
            </div>
        );
    } else if (isFigma) {
        topBarTitle = "Figma";
        topBarSubtitle = figmaStatus?.connected
            ? "Brand compliance scans"
            : "Connect Figma to scan design assets";
        topBarActions = (
            <div style={{ display: "flex", gap: "var(--s-2)" }}>
                <button type="button" className="btn btn--secondary" onClick={goToHub}>
                    All integrations
                </button>
                {!figmaStatus?.connected && (
                    <Link href="/settings" className="btn btn--primary">
                        Connect Figma
                    </Link>
                )}
            </div>
        );
    }

    return (
        <>
            <TopBar title={topBarTitle} subtitle={topBarSubtitle} actions={topBarActions} />

            <main className="page">
                {hubView && (
                    <IntegrationsHub
                        connected={{
                            github: githubStatus?.connected ?? false,
                            aws: awsStatus?.connected ?? false,
                            figma: figmaStatus?.connected ?? false,
                        }}
                    />
                )}

                {isGithub && view === "main" && (
                    <MainView
                        hasScans={hasScans}
                        latestScan={latestScan}
                        scanHistory={scanHistory}
                        onStartConfig={handleStartConfig}
                        onViewResults={handleViewResults}
                        onViewTrends={handleViewTrends}
                        onExportReport={handleExportReport}
                    />
                )}

                {isGithub && view === "config" && (
                    <ConfigView
                        configOrg={configOrg}
                        setConfigOrg={setConfigOrg}
                        configScope={configScope}
                        setConfigScope={setConfigScope}
                        configPolicies={configPolicies}
                        setConfigPolicies={setConfigPolicies}
                        onCancel={handleCancelConfig}
                        onStart={() => void handleStartScan()}
                        githubLogin={githubLogin}
                        scanError={scanError}
                    />
                )}

                {isGithub && view === "scanning" && scanProgress && (
                    <ScanningView progress={scanProgress} org={configOrg} policiesCount={configPolicies.length} />
                )}

                {isGithub && view === "results" && currentScan && (
                    <ResultsView
                        scan={currentScan}
                        onRunAnother={handleStartConfig}
                        onViewTrends={handleViewTrends}
                        onBack={handleBackToMain}
                        onExportReport={handleExportReport}
                    />
                )}

                {isGithub && view === "trends" && (
                    <TrendsView scanHistory={scanHistory} onBack={handleBackFromTrends} />
                )}

                {isAws && (
                    <AwsScanSection
                        awsConnected={awsStatus?.connected ?? false}
                        accountId={awsStatus?.info?.account_id}
                        region={awsStatus?.info?.region}
                        scanning={awsScanning}
                        scanError={awsScanError}
                        scanHistory={awsScanHistory}
                        selectedScan={selectedAwsScan}
                        onTrigger={handleAwsScan}
                        onSelectScan={setSelectedAwsScan}
                        onClearScan={() => setSelectedAwsScan(null)}
                    />
                )}

                {isFigma && <FigmaBrandScanPanel />}
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
    onExportReport,
}: {
    hasScans: boolean;
    latestScan: ScanResult | null;
    scanHistory: ScanResult[];
    onStartConfig: () => void;
    onViewResults: (scan: ScanResult) => void;
    onViewTrends: () => void;
    onExportReport: (scanId: string) => Promise<void>;
}) {
    const [historyFilter, setHistoryFilter] = useState<"all" | "violations" | "compliant">("all");

    const filteredHistory = useMemo(() => {
        if (historyFilter === "all") return scanHistory;
        if (historyFilter === "violations") return scanHistory.filter(s => s.results.violations.length > 0);
        return scanHistory.filter(s => s.results.violations.length === 0);
    }, [scanHistory, historyFilter]);

    if (!hasScans) {
        return (
            <div className="page-empty-shell page-empty-shell--section">
                <PageEmptyIllustration
                    src="/scan-comp.png"
                    title="No scans"
                    label="Your scan history is empty"
                />
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
                        <PageEmptyIllustration
                            src="/scan-comp.png"
                            title="No scans"
                            label="No scans match this filter"
                            compact
                        />
                    ) : (
                        <div className="scan-history">
                            {filteredHistory.map((scan) => (
                                <ScanHistoryItem
                                    key={scan.scan_id}
                                    scan={scan}
                                    onViewResults={() => onViewResults(scan)}
                                    onExportReport={onExportReport}
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


const BUILT_IN_CHECKS = [
    { id: "chk_branch_protection", name: "Branch Protection on Default Branch", severity: "high" as const },
    { id: "chk_pr_reviews", name: "Pull Request Reviews Required", severity: "medium" as const },
    { id: "chk_vulnerability_alerts", name: "Vulnerability Alerts Enabled", severity: "high" as const },
    { id: "chk_actions_restricted", name: "GitHub Actions Restricted to Trusted Sources", severity: "medium" as const },
];

function ConfigView({
    configOrg,
    setConfigOrg,
    configScope,
    setConfigScope,
    configPolicies,
    setConfigPolicies,
    onCancel,
    onStart,
    githubLogin,
    scanError,
}: {
    configOrg: string;
    setConfigOrg: (v: string) => void;
    configScope: ScanScope;
    setConfigScope: (v: ScanScope) => void;
    configPolicies: string[];
    setConfigPolicies: (v: string[]) => void;
    onCancel: () => void;
    onStart: () => void;
    githubLogin: string;
    scanError: string | null;
}) {
    const effectiveOrg = configOrg || githubLogin;
    const canStart = configPolicies.length > 0;

    return (
        <div className="scan-config-page">
            <header className="scan-config-page__header">
                <h2 className="scan-config-page__title">Configure compliance scan</h2>
                <p className="scan-config-page__subtitle">
                    Scan your GitHub organization against built-in governance checks for branch protection, reviews, and security settings.
                </p>
            </header>

            <div className="scan-config-page__layout">
                <div className="scan-config-page__form">
                    {scanError && (
                        <div className="scan-config-page__error" role="alert">
                            {scanError}
                        </div>
                    )}

                    <div className="form-group">
                        <label className="form-label">GitHub username / organization *</label>
                        <input
                            className="input"
                            placeholder={githubLogin || "your-github-username"}
                            value={configOrg}
                            onChange={(e) => setConfigOrg(e.target.value)}
                        />
                        {githubLogin && !configOrg && (
                            <p className="form-hint">Defaults to connected account: @{githubLogin}</p>
                        )}
                    </div>

                    <div className="scan-config-page__row scan-config-page__row--2">
                        <div className="form-group">
                            <label className="form-label">Checks to run</label>
                            <label className="scan-config__policy-option">
                                <input
                                    type="checkbox"
                                    checked={configPolicies.length === BUILT_IN_CHECKS.length}
                                    onChange={(e) => setConfigPolicies(e.target.checked ? BUILT_IN_CHECKS.map((c) => c.id) : [])}
                                />
                                <span>All checks ({BUILT_IN_CHECKS.length})</span>
                            </label>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Target organization</label>
                            <p className="scan-config-page__meta" style={{ marginTop: "var(--s-2)" }}>
                                <BusinessOutlinedIcon sx={{ fontSize: 16 }} />
                                {effectiveOrg ? `@${effectiveOrg}` : "Enter an organization above"}
                            </p>
                        </div>
                    </div>

                    <div className="form-group">
                        <label className="form-label">Scope</label>
                        <div className="scan-config-page__scope">
                            {(["organization", "repositories", "teams"] as ScanScope[]).map((scope) => (
                                <label key={scope} className="scan-config-page__scope-option">
                                    <input
                                        type="radio"
                                        name="scope"
                                        value={scope}
                                        checked={configScope === scope}
                                        onChange={() => setConfigScope(scope)}
                                    />
                                    <span>
                                        {scope === "organization"
                                            ? "Organization-wide"
                                            : scope === "repositories"
                                                ? "Specific repositories"
                                                : "Specific teams"}
                                    </span>
                                </label>
                            ))}
                        </div>
                    </div>
                </div>

                <aside className="scan-config-page__aside">
                    <div className="scan-config-page__card">
                        <h3 className="scan-config-page__card-title">
                            <DescriptionOutlinedIcon sx={{ fontSize: 16 }} />
                            Checks that will run
                        </h3>
                        <ul className="scan-config-page__checks">
                            {BUILT_IN_CHECKS.map((c) => (
                                <li key={c.id} className="scan-config-page__check">
                                    <span className="scan-config-page__check-dot" />
                                    <span className="scan-config-page__check-name">{c.name}</span>
                                    <span className={`badge badge--${c.severity === "high" ? "danger" : "warning"}`} style={{ fontSize: "var(--fs-11)", flexShrink: 0 }}>
                                        {c.severity}
                                    </span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    <div className="scan-config-page__card">
                        <h3 className="scan-config-page__card-title">Before you start</h3>
                        <ul className="scan-config-page__tips">
                            <li>GitHub must be connected in Settings for the scan to authenticate.</li>
                            <li>Organization-wide scope evaluates repos your token can access.</li>
                            <li>Results appear on this page once the scan completes.</li>
                        </ul>
                        <p className="scan-config-page__meta" style={{ marginTop: "var(--s-4)" }}>
                            <AccessTimeOutlinedIcon sx={{ fontSize: 16 }} />
                            Estimated scan time: ~30 seconds
                        </p>
                    </div>
                </aside>
            </div>

            <footer className="scan-config-page__footer">
                <span className="scan-config-page__footer-hint">
                    {canStart ? `Ready to scan @${effectiveOrg || "…"}` : "Select at least one check to continue"}
                </span>
                <button type="button" className="btn btn--secondary" onClick={onCancel}>Cancel</button>
                <button type="button" className="btn btn--primary" onClick={onStart} disabled={!canStart}>
                    Start Scan <ChevronRightOutlinedIcon sx={{ fontSize: 16 }} />
                </button>
            </footer>
        </div>
    );
}


function ScanningView({ progress, org, policiesCount }: { progress: ScanProgress; org: string; policiesCount: number }) {
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
                        <div><strong>Checks enabled:</strong> {policiesCount}</div>
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
    onExportReport,
}: {
    scan: ScanResult;
    onRunAnother: () => void;
    onViewTrends: () => void;
    onBack: () => void;
    onExportReport: (scanId: string) => Promise<void>;
}) {
    const hasViolations = scan.results.violations.length > 0;
    const highRisk = scan.results.violations.filter(v => v.severity === "high");
    const mediumRisk = scan.results.violations.filter(v => v.severity === "medium");
    const lowRisk = scan.results.violations.filter(v => v.severity === "low");
    const scannedRepositories = scan.results.scanned_repositories ?? [];
    const [selectedViolation, setSelectedViolation] = useState<ScanViolation | null>(null);
    const [acknowledgedPolicies, setAcknowledgedPolicies] = useState<string[]>([]);
    const [exportError, setExportError] = useState<string | null>(null);

    useEffect(() => {
        const key = `tf_scan_ack_${scan.scan_id}`;
        const saved = window.localStorage.getItem(key);
        setAcknowledgedPolicies(saved ? JSON.parse(saved) as string[] : []);
        setSelectedViolation(null);
        setExportError(null);
    }, [scan.scan_id]);

    const acknowledgedSet = useMemo(() => new Set(acknowledgedPolicies), [acknowledgedPolicies]);

    const toggleAcknowledged = useCallback((policyId: string) => {
        setAcknowledgedPolicies((current) => {
            const next = current.includes(policyId)
                ? current.filter((id) => id !== policyId)
                : [...current, policyId];
            window.localStorage.setItem(`tf_scan_ack_${scan.scan_id}`, JSON.stringify(next));
            return next;
        });
    }, [scan.scan_id]);

    const handleExportClick = useCallback(async () => {
        setExportError(null);
        try {
            await onExportReport(scan.scan_id);
        } catch (error) {
            setExportError(error instanceof Error ? error.message : "Failed to export report");
        }
    }, [onExportReport, scan.scan_id]);

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
                            <ViolationSection
                                severity="high"
                                violations={highRisk}
                                acknowledgedPolicies={acknowledgedSet}
                                onViewDetails={setSelectedViolation}
                                onToggleAcknowledged={toggleAcknowledged}
                            />
                        )}
                        {mediumRisk.length > 0 && (
                            <ViolationSection
                                severity="medium"
                                violations={mediumRisk}
                                acknowledgedPolicies={acknowledgedSet}
                                onViewDetails={setSelectedViolation}
                                onToggleAcknowledged={toggleAcknowledged}
                            />
                        )}
                        {lowRisk.length > 0 && (
                            <ViolationSection
                                severity="low"
                                violations={lowRisk}
                                acknowledgedPolicies={acknowledgedSet}
                                onViewDetails={setSelectedViolation}
                                onToggleAcknowledged={toggleAcknowledged}
                            />
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
                                    <span className="scan-compliant-item__name">
                                        {policy.policy_name}
                                        {!policy.policy_id.startsWith("chk_") && (
                                            <span className="badge badge--info" style={{ fontSize: "var(--fs-11)", marginLeft: "var(--s-2)", verticalAlign: "middle" }}>
                                                AI Evaluated
                                            </span>
                                        )}
                                    </span>
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
                            <span className="scan-details__label">Repositories Analyzed</span>
                            <span className="scan-details__value">{scannedRepositories.length}</span>
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
                    {scannedRepositories.length > 0 && (
                        <>
                            <div className="divider" />
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                                <span className="scan-details__label">Repository Names</span>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
                                    {scannedRepositories.map((repo) => (
                                        <span
                                            key={repo}
                                            className="badge badge--info"
                                            style={{ fontSize: "var(--fs-11)" }}
                                        >
                                            {repo}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "flex-end" }}>
                <button
                    className="btn btn--secondary"
                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    onClick={() => void handleExportClick()}
                >
                    <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} /> Export Report (PDF)
                </button>
                <button className="btn btn--secondary" onClick={onViewTrends}>
                    <BarChartOutlinedIcon sx={{ fontSize: 16 }} /> View Trends
                </button>
                <button className="btn btn--primary" onClick={onRunAnother}>
                    <RefreshOutlinedIcon sx={{ fontSize: 16 }} /> Run Another Scan
                </button>
            </div>

            {exportError && (
                <div className="panel">
                    <div className="panel__body">
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-critical-text)" }}>{exportError}</p>
                    </div>
                </div>
            )}

            <Modal
                open={selectedViolation !== null}
                onClose={() => setSelectedViolation(null)}
                title={selectedViolation?.policy_name ?? "Violation Details"}
                subtitle={selectedViolation ? `${selectedViolation.severity.toUpperCase()} severity` : undefined}
                footer={
                    selectedViolation ? (
                        <>
                            <button
                                className="btn btn--secondary"
                                onClick={() => toggleAcknowledged(selectedViolation.policy_id)}
                            >
                                {acknowledgedSet.has(selectedViolation.policy_id) ? "Remove Acknowledgement" : "Mark as Acknowledged"}
                            </button>
                            <button className="btn btn--primary" onClick={() => setSelectedViolation(null)}>
                                Close
                            </button>
                        </>
                    ) : undefined
                }
            >
                {selectedViolation && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                        <div>
                            <strong>Issue</strong>
                            <p style={{ marginTop: "var(--s-1)", color: "var(--c-text-secondary)" }}>{selectedViolation.evidence}</p>
                        </div>
                        <div>
                            <strong>Risk Score</strong>
                            <p style={{ marginTop: "var(--s-1)", color: "var(--c-text-secondary)" }}>{selectedViolation.risk_score}</p>
                        </div>
                        <div>
                            <strong>Recommended Fix</strong>
                            <p style={{ marginTop: "var(--s-1)", color: "var(--c-text-secondary)" }}>{selectedViolation.recommendation}</p>
                        </div>
                        {selectedViolation.affected_repositories && selectedViolation.affected_repositories.length > 0 && (
                            <div>
                                <strong>Affected Repositories</strong>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)", marginTop: "var(--s-2)" }}>
                                    {selectedViolation.affected_repositories.map((repo) => (
                                        <span key={`${selectedViolation.policy_id}-${repo}-badge`} className="badge badge--info">
                                            {repo}
                                        </span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </Modal>
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

function ScanHistoryItem({
    scan,
    onViewResults,
    onExportReport,
}: {
    scan: ScanResult;
    onViewResults: () => void;
    onExportReport: (scanId: string) => Promise<void>;
}) {
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
                <button
                    className="btn btn--ghost btn--sm"
                    onClick={(e) => {
                        e.stopPropagation();
                        void onExportReport(scan.scan_id);
                    }}
                >Export PDF</button>
            </div>
            <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: "var(--c-text-muted)", flexShrink: 0 }} />
        </div>
    );
}

function ViolationSection({
    severity,
    violations,
    acknowledgedPolicies,
    onViewDetails,
    onToggleAcknowledged,
}: {
    severity: PolicySeverity;
    violations: ScanViolation[];
    acknowledgedPolicies: Set<string>;
    onViewDetails: (violation: ScanViolation) => void;
    onToggleAcknowledged: (policyId: string) => void;
}) {
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
                            <span className="violation-card__policy">
                                Policy: {v.policy_name}
                                {!v.policy_id.startsWith("chk_") && (
                                    <span className="badge badge--info" style={{ fontSize: "var(--fs-11)", marginLeft: "var(--s-2)", verticalAlign: "middle" }}>
                                        AI Evaluated
                                    </span>
                                )}
                            </span>
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
                    {v.affected_repositories && v.affected_repositories.length > 0 && (
                        <div className="violation-card__evidence">
                            <strong>Affected Repositories:</strong>
                            <ul>
                                {v.affected_repositories.map((repo) => (
                                    <li key={`${v.policy_id}-${repo}`}>{repo}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <div className="violation-card__recommendation">
                        <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                        <div>
                            <strong>Recommended Fix:</strong>
                            <p>{v.recommendation}</p>
                        </div>
                    </div>
                    <div className="violation-card__actions">
                        <button className="btn btn--ghost btn--sm" onClick={() => onViewDetails(v)}>View Details</button>
                        <button className="btn btn--ghost btn--sm" onClick={() => onToggleAcknowledged(v.policy_id)}>
                            {acknowledgedPolicies.has(v.policy_id) ? "Acknowledged" : "Mark as Acknowledged"}
                        </button>
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


// ─── AWS Scan Section ───────────────────────────────────────────────────────

function AwsScanSection({
    awsConnected,
    accountId,
    region,
    scanning,
    scanError,
    scanHistory,
    selectedScan,
    onTrigger,
    onSelectScan,
    onClearScan,
}: {
    awsConnected: boolean;
    accountId?: string;
    region?: string;
    scanning: boolean;
    scanError: string | null;
    scanHistory: AwsScanResult[];
    selectedScan: AwsScanResult | null;
    onTrigger: () => void;
    onSelectScan: (scan: AwsScanResult) => void;
    onClearScan: () => void;
}) {
    if (selectedScan) {
        return <AwsScanResultsView scan={selectedScan} onBack={onClearScan} />;
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                        <CloudOutlinedIcon sx={{ fontSize: 18 }} />
                        AWS Infrastructure Scans
                    </span>
                    {awsConnected && accountId && (
                        <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                            {accountId} · {region ?? "us-east-1"}
                        </span>
                    )}
                </div>

                {scanError && (
                    <div style={{ padding: "var(--s-3) var(--s-4)", background: "rgba(239,68,68,0.08)", borderBottom: "1px solid var(--c-border)", fontSize: "var(--fs-12)", color: "var(--c-critical)" }}>
                        {scanError}
                    </div>
                )}

                <div className="panel__body--flush">
                    {!awsConnected ? (
                        <div className="panel__empty-body">
                            <PageEmptyIllustration
                                src="/cloud.png"
                                title="AWS not connected"
                                label="Connect your account in Settings to run infrastructure scans"
                            >
                                <Link href="/settings" className="btn btn--primary" style={{ marginTop: "var(--s-4)" }}>
                                    Connect AWS in Settings
                                </Link>
                            </PageEmptyIllustration>
                        </div>
                    ) : scanHistory.length === 0 && !scanning ? (
                        <div className="panel__empty-body">
                            <PageEmptyIllustration
                                src="/cloud.png"
                                title="No AWS scans"
                                label="Run your first infrastructure scan"
                            >
                                <button
                                    type="button"
                                    className="btn btn--primary"
                                    style={{ marginTop: "var(--s-4)" }}
                                    onClick={onTrigger}
                                >
                                    <PlayArrowOutlinedIcon sx={{ fontSize: 16 }} /> Run AWS Scan
                                </button>
                            </PageEmptyIllustration>
                        </div>
                    ) : scanning ? (
                        <div className="panel__empty-body">
                            <div className="page-empty page-empty--in-panel">
                                <div className="spinner spinner--lg" style={{ marginBottom: "var(--s-4)" }} />
                                <h2 className="page-empty__title">Running AWS scan</h2>
                                <p className="page-empty__label">Auditing infrastructure controls</p>
                            </div>
                        </div>
                    ) : (
                        <div className="scan-history">
                            {scanHistory.map((scan) => (
                                <div
                                    key={scan.scan_id}
                                    className="scan-history-item"
                                    onClick={() => onSelectScan(scan)}
                                >
                                    <div className="scan-history-item__icon">
                                        <CloudOutlinedIcon sx={{ fontSize: 18 }} />
                                    </div>
                                    <div className="scan-history-item__content">
                                        <div className="scan-history-item__date">{formatDateTime(scan.timestamp)}</div>
                                        <div className="scan-history-item__summary">
                                            {scan.failed_checks > 0
                                                ? `${scan.failed_checks} failed check${scan.failed_checks > 1 ? "s" : ""} out of ${scan.total_checks}`
                                                : `All ${scan.total_checks} checks passed`}
                                        </div>
                                        <div className="scan-history-item__meta">
                                            <span>Account: {scan.account_id}</span>
                                            <span>Region: {scan.region}</span>
                                            <span>Duration: {scan.duration_seconds}s</span>
                                        </div>
                                    </div>
                                    <div className="scan-history-item__score">
                                        <span className={`scan-history-item__score-value ${scan.compliance_score === 100 ? "scan-history-item__score-value--perfect" : scan.compliance_score >= 70 ? "" : "scan-history-item__score-value--low"}`}>
                                            {scan.compliance_score}%
                                        </span>
                                        <span className="scan-history-item__score-label">Compliant</span>
                                    </div>
                                    <div className="scan-history-item__actions">
                                        <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); onSelectScan(scan); }}>View Results</button>
                                    </div>
                                    <ChevronRightOutlinedIcon sx={{ fontSize: 18, color: "var(--c-text-muted)", flexShrink: 0 }} />
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}


function AwsScanResultsView({ scan, onBack }: { scan: AwsScanResult; onBack: () => void }) {
    const failedChecks = scan.checks.filter(c => !c.passed);
    const passedChecks = scan.checks.filter(c => c.passed);
    const highFails = failedChecks.filter(c => c.severity === "high");
    const medFails = failedChecks.filter(c => c.severity === "medium");
    const lowFails = failedChecks.filter(c => c.severity === "low");

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", marginTop: "var(--s-4)" }}>
            <button className="btn btn--ghost btn--sm" onClick={onBack} style={{ alignSelf: "flex-start", gap: 4 }}>
                <ChevronRightOutlinedIcon sx={{ fontSize: 14, transform: "rotate(180deg)" }} /> Back to Scans
            </button>

            {/* Header */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                        <CloudOutlinedIcon sx={{ fontSize: 18 }} />
                        AWS Scan Results — {formatDateTime(scan.timestamp)}
                    </span>
                </div>
                <div className="panel__body">
                    <div className={`scan-result-header ${failedChecks.length > 0 ? "scan-result-header--violations" : "scan-result-header--compliant"}`}>
                        <div className="scan-result-header__icon">
                            {failedChecks.length > 0 ? <WarningAmberOutlinedIcon sx={{ fontSize: 28 }} /> : <CheckCircleOutlinedIcon sx={{ fontSize: 28 }} />}
                        </div>
                        <div className="scan-result-header__content">
                            <h2 className="scan-result-header__title">
                                {failedChecks.length > 0 ? "Compliance Issues Found" : "All Checks Passed!"}
                            </h2>
                            <p className="scan-result-header__subtitle">
                                {failedChecks.length > 0
                                    ? `${failedChecks.length} failed check${failedChecks.length > 1 ? "s" : ""} (${highFails.length} High, ${medFails.length} Medium, ${lowFails.length} Low)`
                                    : `All ${scan.total_checks} NIST-aligned checks passed.`}
                            </p>
                        </div>
                        <div className="scan-result-header__score">
                            <ComplianceGauge score={scan.compliance_score} />
                        </div>
                    </div>
                </div>
            </div>

            {/* Failed Checks */}
            {failedChecks.length > 0 && (
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">Failed Checks ({failedChecks.length})</span>
                    </div>
                    <div className="panel__body--flush">
                        {failedChecks.map((check) => (
                            <AwsCheckCard key={check.check_id} check={check} />
                        ))}
                    </div>
                </div>
            )}

            {/* Passed Checks */}
            {passedChecks.length > 0 && (
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                            <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />
                            Passed Checks ({passedChecks.length})
                        </span>
                    </div>
                    <div className="panel__body--flush">
                        {passedChecks.map((check) => (
                            <div key={check.check_id} className="scan-compliant-item">
                                <div className="scan-compliant-item__icon">
                                    <CheckCircleOutlinedIcon sx={{ fontSize: 16 }} />
                                </div>
                                <div className="scan-compliant-item__content">
                                    <span className="scan-compliant-item__name">{check.check_name}</span>
                                    <span className="scan-compliant-item__evidence">{check.evidence}</span>
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
                            <span className="scan-details__label">Account ID</span>
                            <span className="scan-details__value font-mono">{scan.account_id}</span>
                        </div>
                        <div className="scan-details__item">
                            <span className="scan-details__label">Region</span>
                            <span className="scan-details__value">{scan.region}</span>
                        </div>
                        <div className="scan-details__item">
                            <span className="scan-details__label">Total Checks</span>
                            <span className="scan-details__value">{scan.total_checks}</span>
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
        </div>
    );
}


function AwsCheckCard({ check }: { check: AwsCheckResult }) {
    const sevColor = check.severity === "high" ? "var(--c-critical)" : check.severity === "medium" ? "var(--c-medium, #f59e0b)" : "var(--c-text-muted)";

    return (
        <div style={{ padding: "var(--s-4)", borderBottom: "1px solid var(--c-border)" }}>
            <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-3)", marginBottom: "var(--s-2)" }}>
                <CancelOutlinedIcon sx={{ fontSize: 16, color: sevColor, marginTop: "2px", flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: 4 }}>
                        <span style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-13)" }}>{check.check_name}</span>
                        <span className={`badge badge--${check.severity === "high" ? "danger" : check.severity === "medium" ? "warning" : "neutral"}`} style={{ fontSize: "var(--fs-11)" }}>
                            {check.severity}
                        </span>
                    </div>
                    <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", lineHeight: 1.5, marginBottom: "var(--s-2)" }}>
                        {check.evidence}
                    </p>
                    {check.recommendation && (
                        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-2)", padding: "var(--s-2) var(--s-3)", borderRadius: "var(--r-sm)", background: "rgba(255,255,255,0.03)", border: "1px solid var(--c-border)", fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                            <TipsAndUpdatesOutlinedIcon sx={{ fontSize: 14, flexShrink: 0, marginTop: "1px" }} />
                            {check.recommendation}
                        </div>
                    )}
                    {check.affected_resources.length > 0 && (
                        <div style={{ marginTop: "var(--s-2)", display: "flex", flexWrap: "wrap", gap: "var(--s-1)" }}>
                            {check.affected_resources.map((r, i) => (
                                <span key={i} className="badge badge--info" style={{ fontSize: "var(--fs-11)" }}>{r}</span>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
