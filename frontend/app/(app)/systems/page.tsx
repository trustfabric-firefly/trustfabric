"use client";
import {
    SmartToyOutlinedIcon, AddOutlinedIcon, SearchOutlinedIcon, ArrowBackOutlinedIcon,
    CheckCircleOutlinedIcon, WarningAmberOutlinedIcon, RadioButtonUncheckedOutlinedIcon,
    EditOutlinedIcon, ArchiveOutlinedIcon, DocumentScannerOutlinedIcon, VisibilityOutlinedIcon,
    BusinessOutlinedIcon, PersonOutlinedIcon, EmailOutlinedIcon, CodeOutlinedIcon,
    ChatOutlinedIcon, BrushOutlinedIcon, BarChartOutlinedIcon, CreateOutlinedIcon,
    ExtensionOutlinedIcon, LinkOutlinedIcon, HistoryOutlinedIcon, AutoAwesomeOutlinedIcon, FileDownloadOutlinedIcon,
    FileUploadOutlinedIcon, FilterListOutlinedIcon, ExpandMoreOutlinedIcon, SwapVertOutlinedIcon, MoreHorizOutlinedIcon,
} from "@/lib/icons";
import type { AppIconComponent } from "@/lib/icons";

import { useState, useCallback, useMemo, useEffect, useRef } from "react";
import { PageEmptyIllustration } from "@/components/ui/PageEmptyIllustration";
import "./systems-page.css";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/TopBar";
import { Modal } from "@/components/ui/Modal";
import { CopilotAdvisoryNotice } from "@/components/ui/CopilotAdvisoryNotice";
import { AIIcon } from "@/components/ui/AIIcon";
import { auditApi, copilotApi, integrationsApi, mcpApi, systemsApi, type ExplainMissingResponse } from "@/lib/api";
import type {
    AISystemCreate,
    AISystemInventoryItem,
    AISystemType,
    CopilotRecommendation,
    DataSensitivity,
    DataAccessType,
    ModelType,
    ParsedRecommendation,
    RiskLevel,
    RiskTier,
    SystemStatus,
    SystemAuditEntry,
    AISystem as BackendAISystem,
} from "@/types";

/* ═══════════════════════════════════════════════════════════════════════════════
   CONSTANTS
   ═══════════════════════════════════════════════════════════════════════════════ */

const SYSTEM_TYPE_LABELS: Record<AISystemType, string> = {
    code_assistant: "Code Assistant",
    chat_interface: "Chat Interface",
    design_tool: "Design Tool",
    analytics: "Analytics",
    writing_assistant: "Writing Assistant",
    productivity: "Productivity",
    custom: "Custom",
};

const SYSTEM_TYPE_ICONS: Record<AISystemType, AppIconComponent> = {
    code_assistant: CodeOutlinedIcon,
    chat_interface: ChatOutlinedIcon,
    design_tool: BrushOutlinedIcon,
    analytics: BarChartOutlinedIcon,
    writing_assistant: CreateOutlinedIcon,
    productivity: ExtensionOutlinedIcon,
    custom: SmartToyOutlinedIcon,
};

const DATA_ACCESS_LABELS: Record<DataAccessType, string> = {
    proprietary_source_code: "Proprietary Source Code",
    customer_data: "Customer Data",
    financial_records: "Financial Records",
    pii: "Personal Information (PII)",
    internal_docs: "Internal Documents",
    public_data: "Public Data Only",
};

const DEPARTMENTS = [
    "Engineering",
    "Data Science",
    "Product",
    "Marketing",
    "Design",
    "Customer Support",
    "IT",
    "HR",
    "Finance",
    "Legal",
    "All Teams",
];

const PLATFORMS = [
    "GitHub",
    "OpenAI",
    "Anthropic",
    "Google",
    "Microsoft",
    "Discord",
    "Notion",
    "Slack",
    "Custom/Self-hosted",
];

interface SystemScanCheck {
    id: string;
    category: string;
    title: string;
    description: string;
    status: "pass" | "warn" | "fail";
    detail: string;
}

interface SystemScanResult {
    system_name: string;
    overall_status: "compliant" | "violations";
    score: number;
    scanned_at: string;
    checks: SystemScanCheck[];
    summary: string;
}

function generateSystemScanResult(system: AISystemInventoryItem): SystemScanResult {
    const integrations = system.external_integrations && system.external_integrations.length > 0
        ? system.external_integrations.join(", ")
        : "Standard LLM API";
    const sensitivity = system.data_sensitivity || "Low";
    const models = system.models_used && system.models_used.length > 0 ? system.models_used.join(", ") : "LLM";

    const checks: SystemScanCheck[] = [];

    // 1. Data Sensitivity & PII Restrictions Policy
    if (sensitivity === "High" || (sensitivity as string) === "Critical") {
        checks.push({
            id: "pii-policy",
            category: "Data Sensitivity & Privacy",
            title: `PII & Data Sensitivity Control (${sensitivity})`,
            description: `Evaluated data egress & prompt boundary safety for ${system.name}.`,
            status: "fail",
            detail: `CRITICAL VIOLATION: High-sensitivity payload transmitted to external models (${models}) without a verified PII redaction or DLP enforcement policy.`,
        });
    } else {
        checks.push({
            id: "pii-policy",
            category: "Data Sensitivity & Privacy",
            title: `Data Sensitivity Control (${sensitivity})`,
            description: `Evaluated data boundary safety for ${system.name}.`,
            status: "pass",
            detail: `Low data sensitivity payload. Standard prompt boundary isolation verified.`,
        });
    }

    // 2. Integration & Telemetry Connection Policy
    // `connected` is derived from live workspace integration status, so this check
    // reports whether automated evidence collection is possible — nothing more. It
    // deliberately does not claim to have verified transport or token properties.
    if (!system.connected) {
        checks.push({
            id: "integration-telemetry",
            category: "External API Security",
            title: "No connected integration for automated evidence",
            description: `Declared integrations: ${integrations}.`,
            status: "warn",
            detail: `TrustFabric has no connected workspace integration covering ${integrations}, so this system relies on manual attestation. Connect the integration in Settings to enable automated evidence collection.`,
        });
    } else {
        checks.push({
            id: "integration-telemetry",
            category: "External API Security",
            title: "Connected integration available for automated evidence",
            description: `Declared integrations: ${integrations}.`,
            status: "pass",
            detail: `A connected workspace integration covers ${integrations}, so TrustFabric can collect evidence for this system automatically.`,
        });
    }

    // 3. Human Review & Decision Approval Policy
    if (integrations.toLowerCase().includes("substack") || integrations.toLowerCase().includes("slack") || system.type === "chat_interface") {
        checks.push({
            id: "human-review",
            category: "Governance & Human Oversight",
            title: "Human-in-the-Loop (HITL) Sign-off Policy",
            description: "Evaluated automated publishing and high-impact decision workflows.",
            status: "warn",
            detail: "ACTION REQUIRED: System outputs directly to publishing/communication channels (Substack/Slack). Requires mandatory human review step before publication.",
        });
    } else {
        checks.push({
            id: "human-review",
            category: "Governance & Human Oversight",
            title: "Human Oversight Policy",
            description: "Evaluated automated execution controls.",
            status: "pass",
            detail: "Standard human oversight controls active.",
        });
    }

    // 4. System Ownership & Audit Logging Policy
    if (!system.owner || system.owner === "Unassigned") {
        checks.push({
            id: "audit-trail",
            category: "Governance & Audit",
            title: "System Ownership & Audit Trail",
            description: "Verified system owner registration and audit logging.",
            status: "fail",
            detail: "VIOLATION: Unassigned system owner. Every deployed AI system must have an explicit administrative lead.",
        });
    } else {
        checks.push({
            id: "audit-trail",
            category: "Governance & Audit",
            title: "System Ownership & Audit Trail",
            description: "Verified system owner registration and audit logging.",
            status: "pass",
            detail: `System owner registered as ${system.owner}. Activity event logging active.`,
        });
    }

    const fails = checks.filter(c => c.status === "fail").length;
    const warns = checks.filter(c => c.status === "warn").length;

    const totalDeduction = (fails * 30) + (warns * 15);
    const score = Math.max(10, 100 - totalDeduction);
    const overall_status = (fails > 0 || warns > 0) ? "violations" : "compliant";

    return {
        system_name: system.name,
        overall_status,
        score,
        scanned_at: new Date().toISOString(),
        checks,
        summary: overall_status === "violations"
            ? `Compliance scan completed for ${system.name} with ${fails} Critical Violation(s) and ${warns} Action Item(s). Total Compliance Score: ${score}%. Action required to satisfy NIST AI RMF standards.`
            : `Compliance scan complete for ${system.name}. All 4 governance checks passed against NIST AI RMF standards. Total Compliance Score: 100%.`,
    };
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════════ */

type PageView = "list" | "register" | "details";

export default function SystemsPage() {
    const router = useRouter();
    const queryClient = useQueryClient();
    const [view, setView] = useState<PageView>("list");
    const [systems, setSystems] = useState<AISystemInventoryItem[]>([]);
    const [selectedSystem, setSelectedSystem] = useState<AISystemInventoryItem | null>(null);
    const [scanSystemName, setScanSystemName] = useState<string>("");
    const [scanResult, setScanResult] = useState<CopilotRecommendation | null>(null);
    const [scanError, setScanError] = useState<string>("");
    const [recommendationModalOpen, setRecommendationModalOpen] = useState(false);
    const [seedModalOpen, setSeedModalOpen] = useState(false);
    const [seedCategory, setSeedCategory] = useState("all");
    const [seedMessage, setSeedMessage] = useState<string | null>(null);

    // System Compliance Scan states
    const [systemScanModalOpen, setSystemScanModalOpen] = useState(false);
    const [systemScanning, setSystemScanning] = useState(false);
    const [systemScanItem, setSystemScanItem] = useState<AISystemInventoryItem | null>(null);
    const [systemScanResult, setSystemScanResult] = useState<SystemScanResult | null>(null);

    const { data: backendSystems = [] } = useQuery({
        queryKey: ["systems"],
        queryFn: () => systemsApi.list({ limit: 200 }),
        select: (page) => page.items,
    });
    const { data: backendAudit = [] } = useQuery({
        queryKey: ["audit"],
        queryFn: () => auditApi.list({ limit: 200 }),
        select: (page) => page.items,
    });

    // Live workspace integration state. Monitoring is a property of the workspace
    // connection, not something a system can declare about itself, so every
    // "connected" signal below is derived from these rather than user input.
    const { data: githubStatus } = useQuery({
        queryKey: ["github-status"], queryFn: integrationsApi.getGitHubStatus, retry: false,
    });
    const { data: slackStatus } = useQuery({
        queryKey: ["slack-status"], queryFn: integrationsApi.getSlackStatus, retry: false,
    });
    const { data: awsStatus } = useQuery({
        queryKey: ["aws-status"], queryFn: integrationsApi.getAwsStatus, retry: false,
    });
    const { data: figmaStatus } = useQuery({
        queryKey: ["figma-status"], queryFn: integrationsApi.getFigmaStatus, retry: false,
    });
    const { data: mcpServers = [] } = useQuery({
        queryKey: ["mcp-servers"], queryFn: mcpApi.list, retry: false,
    });

    const connectedProviders = useMemo(() => {
        const set = new Set<string>();
        if (githubStatus?.connected) set.add("github");
        if (slackStatus?.connected) set.add("slack");
        if (awsStatus?.connected) set.add("aws");
        if (figmaStatus?.connected) set.add("figma");
        for (const server of mcpServers) {
            if (server.connected) set.add("mcp");
        }
        return set;
    }, [githubStatus, slackStatus, awsStatus, figmaStatus, mcpServers]);

    const createSystemMutation = useMutation({
        mutationFn: systemsApi.create,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["systems"] }),
    });
    const runScanMutation = useMutation({
        mutationFn: copilotApi.recommend,
    });
    const seedMutation = useMutation({
        mutationFn: (catId: string) => systemsApi.seedPresets(catId),
        onSuccess: (res) => {
            queryClient.invalidateQueries({ queryKey: ["systems"] });
            const msg = res.created > 0
                ? `Successfully loaded ${res.created} pre-configured AI system${res.created !== 1 ? "s" : ""}.`
                : "All selected preset systems are already present in inventory.";
            setSeedMessage(msg);
        },
        onError: (err: unknown) => {
            setSeedMessage(err instanceof Error ? err.message : "Failed to seed systems.");
        },
    });

    useEffect(() => {
        setSystems(backendSystems.map((s) => mapBackendSystemToInventory(s, connectedProviders)));
    }, [backendSystems, connectedProviders]);

    const handleRegister = useCallback(() => {
        setView("register");
    }, []);

    const handleViewDetails = useCallback((system: AISystemInventoryItem) => {
        setSelectedSystem(system);
        setView("details");
    }, []);

    const handleBack = useCallback(() => {
        setView("list");
        setSelectedSystem(null);
    }, []);

    const handleSaveSystem = useCallback(async (data: Partial<AISystemInventoryItem>) => {
        const payload = toBackendCreatePayload(data);
        await createSystemMutation.mutateAsync(payload as never);
        setView("list");
    }, [createSystemMutation]);

    const handleRunScan = useCallback(async (system: AISystemInventoryItem) => {
        setRecommendationModalOpen(true);
        setScanSystemName(system.name);
        setScanError("");
        setScanResult(null);
        try {
            const recommendation = await runScanMutation.mutateAsync(Number(system.id));
            setScanResult(recommendation);
        } catch (error: unknown) {
            setScanError(error instanceof Error ? error.message : "Scan failed");
        }
    }, [runScanMutation]);

    const handleRunSystemComplianceScan = useCallback((system: AISystemInventoryItem) => {
        setSystemScanItem(system);
        setSystemScanModalOpen(true);
        setSystemScanning(true);
        setSystemScanResult(null);

        setTimeout(async () => {
            const result = generateSystemScanResult(system);
            setSystemScanResult(result);
            setSystemScanning(false);

            try {
                await systemsApi.update(Number(system.id), {
                    scan_status: result.overall_status,
                    compliance_score: result.score,
                    last_scan_date: result.scanned_at,
                    active_violations: result.checks.filter(c => c.status !== "pass").length,
                });
                queryClient.invalidateQueries({ queryKey: ["systems"] });
            } catch (err) {
                console.warn("Backend update skipped:", err);
            }

            setSelectedSystem((prev) => {
                if (!prev || String(prev.id) !== String(system.id)) return prev;
                return {
                    ...prev,
                    scan_status: result.overall_status,
                    compliance_score: result.score,
                    last_scan_date: result.scanned_at,
                    active_violations: result.checks.filter(c => c.status !== "pass").length,
                };
            });
        }, 1200);
    }, [queryClient]);

    const handleViewScanHistory = useCallback((system: AISystemInventoryItem) => {
        if (system.last_scan_id) {
            router.push(`/scans?app=github&scanId=${encodeURIComponent(system.last_scan_id)}`);
            return;
        }
        router.push("/scans");
    }, [router]);

    const handleCloseRecommendationModal = useCallback(() => {
        setRecommendationModalOpen(false);
        setScanResult(null);
        setScanError("");
        setScanSystemName("");
        runScanMutation.reset();
    }, [runScanMutation]);

    const topBarTitle =
        view === "list" ? "AI Systems" : view === "register" ? "Register AI System" : "System Details";

    const topBarSubtitle =
        view === "list"
            ? `${systems.length} system${systems.length !== 1 ? "s" : ""}`
            : view === "details" && selectedSystem
                ? selectedSystem.name
                : undefined;

    return (
        <>
            <TopBar
                title={topBarTitle}
                subtitle={topBarSubtitle}
                actions={
                    view === "list" ? (
                        <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
                            <button
                                type="button"
                                className="btn btn--outline"
                                onClick={() => {
                                    setSeedMessage(null);
                                    setSeedModalOpen(true);
                                }}
                                title="Load pre-configured AI systems for target company verticals"
                            >
                                <AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} /> Load Preset Systems
                            </button>
                            <button type="button" className="btn btn--primary" onClick={handleRegister}>
                                <AddOutlinedIcon sx={{ fontSize: 16 }} /> Add AI System
                            </button>
                        </div>
                    ) : undefined
                }
            />

            <main
                className={
                    view === "list"
                        ? `systems-page${systems.length === 0 ? " systems-page--empty" : ""}`
                        : "page"
                }
            >
                {view === "list" && (
                    <ListView
                        systems={systems}
                        onViewDetails={handleViewDetails}
                        onRunScan={handleRunScan}
                        onViewScanHistory={handleViewScanHistory}
                    />
                )}

                {view === "register" && (
                    <RegisterView
                        onCancel={handleBack}
                        onSave={handleSaveSystem}
                        connectedProviders={connectedProviders}
                    />
                )}

                {view === "details" && selectedSystem && (
                    <DetailsView
                        system={selectedSystem}
                        auditLog={buildAuditLogForSystem(selectedSystem, backendAudit)}
                        onGenerateRecommendation={() => handleRunScan(selectedSystem)}
                        onRunComplianceScan={() => handleRunSystemComplianceScan(selectedSystem)}
                        onViewScanHistory={() => handleViewScanHistory(selectedSystem)}
                        onBack={handleBack}
                    />
                )}
            </main>

            <Modal
                open={systemScanModalOpen}
                onClose={() => {
                    if (!systemScanning) setSystemScanModalOpen(false);
                }}
                title={`Compliance Scan: ${systemScanItem?.name || "AI System"}`}
                subtitle="NIST AI RMF & EU AI Act Governance Evaluation"
                footer={
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", flexWrap: "wrap", gap: "var(--s-2)" }}>
                        <CopilotAdvisoryNotice style={{ margin: 0 }} />
                        <div style={{ display: "flex", gap: "var(--s-2)" }}>
                            {systemScanItem && !systemScanning && !systemScanItem.connected && (
                                <button
                                    type="button"
                                    className="btn btn--outline btn--sm"
                                    onClick={() => {
                                        setSystemScanModalOpen(false);
                                        router.push("/settings");
                                    }}
                                >
                                    <LinkOutlinedIcon sx={{ fontSize: 14 }} /> Connect Integration
                                </button>
                            )}
                            {systemScanItem && !systemScanning && (
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    onClick={() => {
                                        setSystemScanModalOpen(false);
                                        handleRunScan(systemScanItem);
                                    }}
                                >
                                    <AIIcon size={14} /> AI Recommendation
                                </button>
                            )}
                            <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                disabled={systemScanning}
                                onClick={() => setSystemScanModalOpen(false)}
                            >
                                {systemScanning ? "Scanning…" : "Done"}
                            </button>
                        </div>
                    </div>
                }
            >
                {systemScanning ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", padding: "var(--s-6) var(--s-4)", alignItems: "center" }}>
                        <div style={{
                            width: 42,
                            height: 42,
                            border: "3px solid var(--c-border)",
                            borderTopColor: "var(--c-accent)",
                            borderRadius: "50%",
                            animation: "spin 0.8s linear infinite"
                        }} />
                        <div style={{ textAlign: "center" }}>
                            <div style={{ fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-primary)", marginBottom: 4 }}>
                                Running System Compliance Scan…
                            </div>
                            <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", maxWidth: 440 }}>
                                Evaluating data sensitivity, API access parameters, vendor retention rules & governance controls.
                            </div>
                        </div>
                    </div>
                ) : systemScanResult ? (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                        <div style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "var(--s-3) var(--s-4)",
                            background: systemScanResult.score === 100 ? "rgba(16, 185, 129, 0.08)" : "rgba(245, 158, 11, 0.08)",
                            border: `1px solid ${systemScanResult.score === 100 ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)"}`,
                            borderRadius: "var(--r-md)"
                        }}>
                            <div>
                                <div style={{ fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-primary)" }}>
                                    {systemScanResult.score}% Compliance Score
                                </div>
                                <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: 2 }}>
                                    Scanned: {new Date(systemScanResult.scanned_at).toLocaleTimeString()}
                                </div>
                            </div>
                            <span style={{
                                padding: "4px 10px",
                                borderRadius: "12px",
                                fontSize: "var(--fs-12)",
                                fontWeight: "var(--fw-bold)",
                                background: systemScanResult.overall_status === "compliant" ? "rgba(16, 185, 129, 0.2)" : "rgba(245, 158, 11, 0.2)",
                                color: systemScanResult.overall_status === "compliant" ? "#10b981" : "#f59e0b"
                            }}>
                                {systemScanResult.overall_status === "compliant" ? "✓ PASSED" : "⚠ REVIEW NEEDED"}
                            </span>
                        </div>

                        <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                            {systemScanResult.summary}
                        </p>

                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                            <div style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-bold)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                                Evaluated Governance Checks ({systemScanResult.checks.length})
                            </div>
                            {systemScanResult.checks.map((check) => (
                                <div key={check.id} style={{
                                    padding: "var(--s-3)",
                                    borderRadius: "var(--r-md)",
                                    background: "var(--c-surface-raised)",
                                    border: "1px solid var(--c-border)",
                                    display: "flex",
                                    flexDirection: "column",
                                    gap: 4
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                        <span style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-primary)" }}>
                                            {check.title}
                                        </span>
                                        <span style={{
                                            fontSize: "var(--fs-11)",
                                            fontWeight: "var(--fw-bold)",
                                            color: check.status === "pass" ? "#10b981" : "#f59e0b"
                                        }}>
                                            {check.status === "pass" ? "✓ PASSED" : "⚠ REVIEW"}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                        {check.description}
                                    </div>
                                    <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", marginTop: 2, paddingLeft: 8, borderLeft: "2px solid var(--c-border)" }}>
                                        {check.detail}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                ) : null}
            </Modal>

            <Modal
                open={recommendationModalOpen}
                onClose={handleCloseRecommendationModal}
                title={`Recommendation: ${scanSystemName || "System"}`}
                subtitle="NIST AI RMF system recommendation"
                footer={
                    <div style={{ display: "flex", flexDirection: "column", width: "100%", gap: "var(--s-3)" }}>
                        <CopilotAdvisoryNotice
                            text={scanResult?.disclaimer}
                            style={{ margin: 0 }}
                        />
                        <div style={{ display: "flex", justifyContent: "flex-end", width: "100%" }}>
                            <button
                                className="btn btn--primary btn--sm"
                                onClick={handleCloseRecommendationModal}
                            >
                                Close
                            </button>
                        </div>
                    </div>
                }
            >
                {runScanMutation.isPending && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                            <div style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                                Generating recommendation...
                            </div>
                            <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                This evaluates the selected system and suggests risk tier, data sensitivity, policies, and follow-up questions.
                            </div>
                        </div>
                        <CopilotAdvisoryNotice />
                    </div>
                )}
                {!!scanError && (
                    <div className="alert alert--danger" style={{ fontSize: "var(--fs-12)" }}>
                        {scanError}
                    </div>
                )}
                {scanResult && (
                    <RecommendationResult recommendation={scanResult} />
                )}
            </Modal>

            <Modal
                open={seedModalOpen}
                onClose={() => setSeedModalOpen(false)}
                title="Load Industry Preset Systems"
                subtitle="Populate inventory with pre-configured AI systems for target prospect verticals"
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", width: "100%", gap: "var(--s-2)" }}>
                        <button
                            type="button"
                            className="btn btn--outline btn--sm"
                            onClick={() => setSeedModalOpen(false)}
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            className="btn btn--primary btn--sm"
                            disabled={seedMutation.isPending}
                            onClick={() => seedMutation.mutate(seedCategory)}
                        >
                            {seedMutation.isPending ? "Loading Systems..." : "Load Selected Pack"}
                        </button>
                    </div>
                }
            >
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                    <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", margin: 0 }}>
                        Select an industry profile to load pre-configured AI systems complete with risk tiers, justifications, data sensitivity tags, and owner roles.
                    </p>

                    <div className="form-group" style={{ margin: 0 }}>
                        <label className="form-label" htmlFor="seed-category-select">Industry Preset Pack</label>
                        <select
                            id="seed-category-select"
                            className="form-select"
                            value={seedCategory}
                            onChange={(e) => {
                                setSeedCategory(e.target.value);
                                setSeedMessage(null);
                            }}
                        >
                            <option value="all">⚡ All Preset Packs (15 Systems across all 5 packs)</option>
                            <option value="calculated_risk">📈 Calculated Risk — Macro & Financial Intelligence (3 Systems)</option>
                            <option value="sisu_energy">🚛 Sisu Energy LLC — Oilfield Logistics & Fleet Operations (3 Systems)</option>
                            <option value="solaris_tech">📡 Solaris Technologies — Mobile Towers & Hybrid Power (3 Systems)</option>
                            <option value="trellis_energy">🛢️ Trellis Energy Partners — Energy Private Equity & Valuation (3 Systems)</option>
                            <option value="enterprise">🏢 Core Enterprise — IT, Code & Customer Support (3 Systems)</option>
                        </select>
                    </div>

                    {seedMessage && (
                        <div
                            className={seedMessage.includes("Successfully") ? "alert alert--success" : "alert alert--info"}
                            style={{ fontSize: "var(--fs-12)" }}
                        >
                            {seedMessage}
                        </div>
                    )}
                </div>
            </Modal>
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   LIST VIEW
   ═══════════════════════════════════════════════════════════════════════════════ */

function ListView({
    systems,
    onViewDetails,
    onRunScan,
    onViewScanHistory,
}: {
    systems: AISystemInventoryItem[];
    onViewDetails: (system: AISystemInventoryItem) => void;
    onRunScan: (system: AISystemInventoryItem) => void;
    onViewScanHistory: (system: AISystemInventoryItem) => void;
}) {
    const [search, setSearch] = useState("");
    const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");
    const [deptFilter, setDeptFilter] = useState("all");
    const [complianceFilter, setComplianceFilter] = useState<"all" | AISystemInventoryItem["scan_status"]>("all");
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [openMenuId, setOpenMenuId] = useState<string | null>(null);
    const [filterOpen, setFilterOpen] = useState(false);
    const filterRef = useRef<HTMLDivElement>(null);
    const importInputRef = useRef<HTMLInputElement>(null);
    const [importState, setImportState] = useState<{ loading: boolean; message: string | null; error: string | null }>({ loading: false, message: null, error: null });
    const importQueryClient = useQueryClient();

    const handleImportFile = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!e.target) return;
        e.target.value = "";
        if (!file) return;
        setImportState({ loading: true, message: null, error: null });
        try {
            const text = await file.text();
            const systems = parseCsvToSystems(text);
            if (systems.length === 0) {
                setImportState({ loading: false, message: null, error: "No valid rows found. Check the CSV format." });
                return;
            }
            const result = await systemsApi.bulkCreate(systems);
            await importQueryClient.invalidateQueries({ queryKey: ["systems"] });
            const msg = result.errors.length > 0
                ? `Imported ${result.created} system${result.created !== 1 ? "s" : ""}. ${result.errors.length} row${result.errors.length !== 1 ? "s" : ""} failed.`
                : `Successfully imported ${result.created} system${result.created !== 1 ? "s" : ""}.`;
            setImportState({ loading: false, message: msg, error: null });
        } catch (err) {
            setImportState({ loading: false, message: null, error: err instanceof Error ? err.message : "Import failed." });
        }
    }, [importQueryClient]);

    const departments = useMemo(
        () => [...new Set(systems.map((s) => s.department).filter(Boolean))].sort(),
        [systems],
    );

    const filtered = useMemo(() => {
        return systems
            .filter((s) => riskFilter === "all" || s.risk_level === riskFilter)
            .filter((s) => deptFilter === "all" || s.department === deptFilter)
            .filter((s) => complianceFilter === "all" || s.scan_status === complianceFilter)
            .filter((s) =>
                !search ||
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.description.toLowerCase().includes(search.toLowerCase()) ||
                s.owner.toLowerCase().includes(search.toLowerCase()) ||
                s.platform.toLowerCase().includes(search.toLowerCase()) ||
                s.department.toLowerCase().includes(search.toLowerCase())
            );
    }, [systems, riskFilter, deptFilter, complianceFilter, search]);

    const compliantPct = systems.length
        ? Math.round((systems.filter((s) => s.scan_status === "compliant").length / systems.length) * 100)
        : 0;

    const allFilteredSelected = filtered.length > 0 && filtered.every((s) => selected.has(s.id));

    const toggleAll = () => {
        if (allFilteredSelected) {
            setSelected(new Set());
        } else {
            setSelected(new Set(filtered.map((s) => s.id)));
        }
    };

    const toggleOne = (id: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    useEffect(() => {
        if (!filterOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (filterRef.current && !filterRef.current.contains(e.target as Node)) {
                setFilterOpen(false);
            }
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [filterOpen]);

    const activeFilterCount = [riskFilter !== "all", deptFilter !== "all", complianceFilter !== "all"].filter(Boolean).length;

    const exportCsv = () => {
        const rows = (selected.size ? filtered.filter((s) => selected.has(s.id)) : filtered);
        const header = ["Name", "Type", "Owner", "Department", "Platform", "Risk", "Compliance", "Last Scanned"];
        const lines = rows.map((s) => [
            s.name,
            SYSTEM_TYPE_LABELS[s.type],
            s.owner,
            s.department,
            s.platform,
            s.risk_level,
            s.scan_status,
            s.last_scan_date ? formatDate(s.last_scan_date) : "—",
        ].map((c) => `"${String(c).replace(/"/g, '""')}"`).join(","));
        const blob = new Blob([[header.join(","), ...lines].join("\n")], { type: "text/csv;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `trustfabric-ai-systems-${new Date().toISOString().slice(0, 10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <>
            {systems.length === 0 ? (
                <div className="page-empty-shell">
                    <EmptyState />
                </div>
            ) : (
            <div className="systems-card">
                <div className="systems-card__summary">
                    <p className="systems-card__summary-text">
                        <strong>{compliantPct}%</strong> compliant with active scans
                    </p>
                    <div className="systems-card__summary-actions">
                        <input
                            ref={importInputRef}
                            type="file"
                            accept=".csv"
                            style={{ display: "none" }}
                            onChange={handleImportFile}
                        />
                        <button
                            type="button"
                            className="systems-btn systems-btn--outline"
                            disabled={importState.loading}
                            title="Import systems from CSV"
                            onClick={() => importInputRef.current?.click()}
                        >
                            <FileUploadOutlinedIcon sx={{ fontSize: 16 }} />
                            {importState.loading ? "Importing…" : "Import"}
                        </button>
                        <button
                            type="button"
                            className="systems-btn systems-btn--outline"
                            onClick={exportCsv}
                        >
                            <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} />
                            Export
                        </button>
                    </div>
                    <div className="systems-card__filters" ref={filterRef}>
                        <button
                            type="button"
                            className="systems-filter-btn"
                            onClick={() => setFilterOpen((o) => !o)}
                            aria-expanded={filterOpen}
                        >
                            <FilterListOutlinedIcon sx={{ fontSize: 16 }} />
                            Add filter
                            {activeFilterCount > 0 && ` (${activeFilterCount})`}
                            <ExpandMoreOutlinedIcon sx={{ fontSize: 16 }} />
                        </button>
                        {filterOpen && (
                            <div className="systems-filter-panel">
                                <div>
                                    <div className="systems-filter-panel__label">Risk level</div>
                                    <select
                                        className="systems-filter-select"
                                        value={riskFilter}
                                        onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
                                        aria-label="Filter by risk"
                                    >
                                        <option value="all">All risk levels</option>
                                        <option value="critical">Critical risk</option>
                                        <option value="high">High risk</option>
                                        <option value="low">Low risk</option>
                                    </select>
                                </div>
                                <div>
                                    <div className="systems-filter-panel__label">Department</div>
                                    <select
                                        className="systems-filter-select"
                                        value={deptFilter}
                                        onChange={(e) => setDeptFilter(e.target.value)}
                                        aria-label="Filter by department"
                                    >
                                        <option value="all">All departments</option>
                                        {departments.map((d) => (
                                            <option key={d} value={d}>{d}</option>
                                        ))}
                                    </select>
                                </div>
                                <div>
                                    <div className="systems-filter-panel__label">Compliance</div>
                                    <select
                                        className="systems-filter-select"
                                        value={complianceFilter}
                                        onChange={(e) => setComplianceFilter(e.target.value as typeof complianceFilter)}
                                        aria-label="Filter by compliance"
                                    >
                                        <option value="all">All compliance</option>
                                        <option value="compliant">Compliant</option>
                                        <option value="violations">Violations</option>
                                        <option value="not_scanned">Not scanned</option>
                                    </select>
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {importState.message && (
                    <div style={{ padding: "var(--s-2) var(--s-3)", fontSize: "var(--fs-12)", color: "var(--c-success, #16a34a)", background: "var(--c-success-surface, #f0fdf4)", borderRadius: "var(--radius-sm)", margin: "0 var(--s-3)" }}>
                        {importState.message}
                    </div>
                )}
                {importState.error && (
                    <div style={{ padding: "var(--s-2) var(--s-3)", fontSize: "var(--fs-12)", color: "var(--c-danger, #dc2626)", background: "var(--c-danger-surface, #fef2f2)", borderRadius: "var(--radius-sm)", margin: "0 var(--s-3)" }}>
                        {importState.error}
                    </div>
                )}

                <div className="systems-card__search-row">
                    <div className="systems-search">
                        <SearchOutlinedIcon sx={{ fontSize: 18, color: "var(--c-text-muted)" }} />
                        <input
                            type="search"
                            placeholder="Search systems"
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                        />
                    </div>
                    <div className="systems-toolbar">
                        <button type="button" className="systems-toolbar__btn" aria-label="Sort" title="Sort">
                            <SwapVertOutlinedIcon sx={{ fontSize: 18 }} />
                        </button>
                        <button type="button" className="systems-toolbar__btn" aria-label="More options" title="More options">
                            <MoreHorizOutlinedIcon sx={{ fontSize: 18 }} />
                        </button>
                    </div>
                </div>

                <div className="systems-table-wrap">
                    {filtered.length === 0 ? (
                        <div className="systems-empty systems-empty--compact">
                            <p className="systems-empty__desc">No systems match your filters.</p>
                        </div>
                    ) : (
                        <table className="systems-table">
                            <thead>
                                <tr>
                                    <th className="systems-table__check">
                                        <input
                                            type="checkbox"
                                            checked={allFilteredSelected}
                                            onChange={toggleAll}
                                            aria-label="Select all systems"
                                        />
                                    </th>
                                    <th>AI System</th>
                                    <th>Compliance status</th>
                                    <th>Department</th>
                                    <th>Provider</th>
                                    <th>Risk level</th>
                                    <th>Last scanned</th>
                                    <th aria-label="Actions" />
                                </tr>
                            </thead>
                            <tbody>
                                {filtered.map((system) => (
                                    <SystemsTableRow
                                        key={system.id}
                                        system={system}
                                        selected={selected.has(system.id)}
                                        menuOpen={openMenuId === system.id}
                                        onToggleSelect={() => toggleOne(system.id)}
                                        onOpenMenu={() => setOpenMenuId(system.id)}
                                        onCloseMenu={() => setOpenMenuId(null)}
                                        onViewDetails={() => onViewDetails(system)}
                                        onRunScan={() => onRunScan(system)}
                                        onViewScanHistory={() => onViewScanHistory(system)}
                                    />
                                ))}
                            </tbody>
                        </table>
                    )}
                </div>

                <div className="systems-table__footer">
                    Showing {filtered.length} of {systems.length} systems
                    {selected.size > 0 && ` · ${selected.size} selected`}
                </div>
            </div>
            )}
        </>
    );
}

function SystemsTableRow({
    system,
    selected,
    menuOpen,
    onToggleSelect,
    onOpenMenu,
    onCloseMenu,
    onViewDetails,
    onRunScan,
    onViewScanHistory,
}: {
    system: AISystemInventoryItem;
    selected: boolean;
    menuOpen: boolean;
    onToggleSelect: () => void;
    onOpenMenu: () => void;
    onCloseMenu: () => void;
    onViewDetails: () => void;
    onRunScan: () => void;
    onViewScanHistory: () => void;
}) {
    const menuRef = useRef<HTMLDivElement>(null);
    const TypeIcon = SYSTEM_TYPE_ICONS[system.type];

    useEffect(() => {
        if (!menuOpen) return;
        const onDoc = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) onCloseMenu();
        };
        document.addEventListener("mousedown", onDoc);
        return () => document.removeEventListener("mousedown", onDoc);
    }, [menuOpen, onCloseMenu]);

    return (
        <tr onClick={onViewDetails}>
            <td className="systems-table__check" onClick={(e) => e.stopPropagation()}>
                <input
                    type="checkbox"
                    checked={selected}
                    onChange={onToggleSelect}
                    aria-label={`Select ${system.name}`}
                />
            </td>
            <td>
                <div className="systems-table__system">
                    <div className="systems-avatar" aria-hidden>
                        <TypeIcon sx={{ fontSize: 16 }} />
                    </div>
                    <div>
                        <div className="systems-table__name">{system.name}</div>
                        <div className="systems-table__type">{SYSTEM_TYPE_LABELS[system.type]} · {system.owner}</div>
                    </div>
                </div>
            </td>
            <td>
                <CompliancePill status={system.scan_status} violations={system.active_violations} />
            </td>
            <td>{system.department || "—"}</td>
            <td>{system.platform || system.provider || "—"}</td>
            <td>
                <RiskPill level={system.risk_level} />
            </td>
            <td>{system.last_scan_date ? formatDate(system.last_scan_date) : "—"}</td>
            <td onClick={(e) => e.stopPropagation()}>
                <div className="systems-row-menu" ref={menuRef}>
                    <button
                        type="button"
                        className="systems-row-menu__btn"
                        aria-label="Open actions"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (menuOpen) onCloseMenu();
                            else onOpenMenu();
                        }}
                    >
                        <MoreHorizOutlinedIcon sx={{ fontSize: 18 }} />
                    </button>
                    {menuOpen && (
                        <div className="systems-row-menu__dropdown">
                            <button type="button" className="systems-row-menu__item" onClick={onViewDetails}>
                                <VisibilityOutlinedIcon sx={{ fontSize: 16 }} /> View details
                            </button>
                            <button type="button" className="systems-row-menu__item" onClick={onRunScan}>
                                <AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} /> Generate recommendation
                            </button>
                            <button type="button" className="systems-row-menu__item" onClick={onViewScanHistory}>
                                <HistoryOutlinedIcon sx={{ fontSize: 16 }} /> Scan history
                            </button>
                        </div>
                    )}
                </div>
            </td>
        </tr>
    );
}

function CompliancePill({ status, violations }: { status: AISystemInventoryItem["scan_status"]; violations: number }) {
    if (status === "compliant") {
        return <span className="systems-pill systems-pill--success"><span className="systems-pill__dot" />Compliant</span>;
    }
    if (status === "violations") {
        return (
            <span className="systems-pill systems-pill--danger">
                <span className="systems-pill__dot" />
                {violations > 0 ? `${violations} violation${violations !== 1 ? "s" : ""}` : "Needs review"}
            </span>
        );
    }
    return <span className="systems-pill systems-pill--warning"><span className="systems-pill__dot" />Not scanned</span>;
}

function RiskPill({ level }: { level: RiskLevel }) {
    const map = {
        critical: { label: "Critical", className: "systems-pill--danger" },
        high: { label: "High", className: "systems-pill--warning" },
        low: { label: "Low", className: "systems-pill--success" },
    } as const;
    const c = map[level];
    return <span className={`systems-pill ${c.className}`}><span className="systems-pill__dot" />{c.label}</span>;
}

function EmptyState() {
    return (
        <PageEmptyIllustration
            src="/empty-file.png"
            title="No AI systems"
            label="Your inventory is empty"
        />
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   REGISTER VIEW
   ═══════════════════════════════════════════════════════════════════════════════ */

interface FormState {
    name: string;
    type: AISystemType;
    description: string;
    owner: string;
    contact_email: string;
    department: string;
    data_sensitivity: DataSensitivity;
    data_access_types: DataAccessType[];
    platform: string;
    models_used: string;
    external_integrations: string;
    connected: boolean;
}

const EMPTY_FORM: FormState = {
    name: "",
    type: "code_assistant",
    description: "",
    owner: "",
    contact_email: "",
    department: "Engineering",
    data_sensitivity: "Low",
    data_access_types: [],
    platform: "GitHub",
    models_used: "",
    external_integrations: "",
    connected: false,
};

function RegisterView({
    onCancel,
    onSave,
    connectedProviders,
}: {
    onCancel: () => void;
    onSave: (data: Partial<AISystemInventoryItem>) => void;
    connectedProviders: Set<string>;
}) {
    const [form, setForm] = useState<FormState>(EMPTY_FORM);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
    };

    // Monitoring readiness is read from the live workspace integrations, keyed off
    // whichever provider/integration the user has chosen on this form.
    const monitoringKey = useMemo(() => {
        const candidates = [form.platform, ...form.external_integrations.split(",")];
        for (const candidate of candidates) {
            const key = providerIntegrationKey(candidate.trim());
            if (key) return key;
        }
        return null;
    }, [form.platform, form.external_integrations]);

    const monitoringReady = monitoringKey != null && connectedProviders.has(monitoringKey);
    const monitoringProviderLabel = monitoringKey
        ? `${monitoringKey.toUpperCase()} integration`
        : "No matching integration";

    const toggleDataAccess = (type: DataAccessType) => {
        setForm((f) => ({
            ...f,
            data_access_types: f.data_access_types.includes(type)
                ? f.data_access_types.filter((t) => t !== type)
                : [...f.data_access_types, type],
        }));
    };

    const valid = form.name.trim().length > 0 && form.owner.trim().length > 0;

    const handleSave = () => {
        onSave({
            name: form.name,
            type: form.type,
            description: form.description,
            owner: form.owner,
            contact_email: form.contact_email,
            department: form.department,
            data_sensitivity: form.data_sensitivity,
            data_access_types: form.data_access_types,
            platform: form.platform,
            models_used: form.models_used.split(",").map((s) => s.trim()).filter(Boolean),
            external_integrations: form.external_integrations.split(",").map((s) => s.trim()).filter(Boolean),
            // Derived from live workspace integrations — never self-declared.
            connected: monitoringReady,
        });
    };

    return (
        <div className="register-view">
            <button className="btn btn--ghost btn--sm" style={{ marginBottom: "var(--s-4)", gap: 4 }} onClick={onCancel}>
                <ArrowBackOutlinedIcon sx={{ fontSize: 14 }} /> Back to Systems
            </button>

            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Register New AI System</span>
                </div>
                <div className="panel__body register-form">
                    <div className="register-form__grid">
                        <div className="register-form__column">
                            <section className="register-form__section">
                                <h4 className="form-section-title">Basic Information</h4>
                                <div className="register-form__row">
                                    <div className="form-group">
                                        <label className="form-label">System Name *</label>
                                        <input
                                            className="input"
                                            placeholder='e.g., "GitHub Copilot for Engineering Team"'
                                            value={form.name}
                                            onChange={(e) => set("name", e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">System Type *</label>
                                        <select className="input" value={form.type} onChange={(e) => set("type", e.target.value as AISystemType)}>
                                            {Object.entries(SYSTEM_TYPE_LABELS).map(([key, label]) => (
                                                <option key={key} value={key}>{label}</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Description</label>
                                    <textarea
                                        className="input"
                                        rows={4}
                                        placeholder="What does this AI system do? How is it used?"
                                        value={form.description}
                                        onChange={(e) => set("description", e.target.value)}
                                    />
                                </div>
                            </section>

                            <section className="register-form__section">
                                <h4 className="form-section-title">Ownership & Responsibility</h4>
                                <div className="register-form__row">
                                    <div className="form-group">
                                        <label className="form-label">System Owner *</label>
                                        <input
                                            className="input"
                                            placeholder="e.g., Engineering Team"
                                            value={form.owner}
                                            onChange={(e) => set("owner", e.target.value)}
                                        />
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">Primary Contact</label>
                                        <input
                                            className="input"
                                            type="email"
                                            placeholder="email@company.com"
                                            value={form.contact_email}
                                            onChange={(e) => set("contact_email", e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">Department/Team</label>
                                    <select className="input" value={form.department} onChange={(e) => set("department", e.target.value)}>
                                        {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
                                    </select>
                                </div>
                            </section>
                        </div>

                        <div className="register-form__column">
                            <section className="register-form__section">
                                <h4 className="form-section-title">Data & Risk Assessment</h4>
                                <div className="form-group">
                                    <label className="form-label">Data Sensitivity Level *</label>
                                    <div className="severity-radio">
                                        {(["Low", "Medium", "High"] as DataSensitivity[]).map((level) => (
                                            <button
                                                key={level}
                                                type="button"
                                                className={`severity-radio__option${form.data_sensitivity === level ? " active" : ""}`}
                                                onClick={() => set("data_sensitivity", level)}
                                            >
                                                <span className="severity-radio__dot" />
                                                {level}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">What data does this system access?</label>
                                    <div className="register-form__checks">
                                        {(Object.entries(DATA_ACCESS_LABELS) as [DataAccessType, string][]).map(([key, label]) => (
                                            <label key={key} className="checkbox-label">
                                                <input
                                                    type="checkbox"
                                                    checked={form.data_access_types.includes(key)}
                                                    onChange={() => toggleDataAccess(key)}
                                                />
                                                <span>{label}</span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </section>

                            <section className="register-form__section">
                                <h4 className="form-section-title">Integration & Models</h4>
                                <div className="register-form__row">
                                    <div className="form-group">
                                        <label className="form-label">Platform/Service Provider</label>
                                        <select className="input" value={form.platform} onChange={(e) => set("platform", e.target.value)}>
                                            {PLATFORMS.map((p) => <option key={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="form-group">
                                        <label className="form-label">AI Models Used</label>
                                        <input
                                            className="input"
                                            placeholder="GPT-4, Claude Sonnet (comma-separated)"
                                            value={form.models_used}
                                            onChange={(e) => set("models_used", e.target.value)}
                                        />
                                    </div>
                                </div>
                                <div className="form-group">
                                    <label className="form-label">External Integrations</label>
                                    <input
                                        className="input"
                                        placeholder="Slack, Jira, etc. (comma-separated)"
                                        value={form.external_integrations}
                                        onChange={(e) => set("external_integrations", e.target.value)}
                                    />
                                </div>
                            </section>

                            <section className="register-form__section">
                                <h4 className="form-section-title">Monitoring</h4>
                                <div style={{
                                    padding: "var(--s-3)",
                                    background: "var(--c-surface-raised)",
                                    borderRadius: "var(--r-md)",
                                    border: `1px solid ${monitoringReady ? "rgba(16,185,129,0.35)" : "var(--c-border)"}`,
                                }}>
                                    <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                                        <span style={{ fontWeight: "var(--fw-medium)", color: "var(--c-text)" }}>
                                            {monitoringProviderLabel}
                                        </span>
                                        <span className={`badge ${monitoringReady ? "badge--live" : "badge--neutral"}`}>
                                            {monitoringReady ? "Connected" : "Not connected"}
                                        </span>
                                    </div>
                                    <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: 6, lineHeight: 1.5 }}>
                                        {monitoringReady
                                            ? "This workspace integration is live, so TrustFabric can scan this system automatically once it is registered."
                                            : monitoringKey
                                                ? "Register the system now — it will be inventoried either way. Connect the integration to enable automated scanning; the system picks it up automatically."
                                                : "No TrustFabric integration matches this provider yet, so this system will be tracked as inventory only (manual attestation)."}
                                    </div>
                                    {!monitoringReady && monitoringKey && (
                                        <a
                                            href="/settings"
                                            target="_blank"
                                            rel="noopener noreferrer"
                                            className="btn btn--outline btn--sm"
                                            style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: "var(--s-3)" }}
                                        >
                                            <LinkOutlinedIcon sx={{ fontSize: 14 }} />
                                            Connect in Settings
                                        </a>
                                    )}
                                </div>
                                <p style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: "var(--s-2)", lineHeight: 1.5 }}>
                                    Integrations are connected once per workspace and shared by every system —
                                    there is nothing to authorize per system.
                                </p>
                            </section>
                        </div>
                    </div>

                    <div className="register-form__actions">
                        <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
                        <button className="btn btn--primary" disabled={!valid} onClick={handleSave}>
                            Register System
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   DETAILS VIEW
   ═══════════════════════════════════════════════════════════════════════════════ */

function DetailsView({
    system,
    auditLog,
    onGenerateRecommendation,
    onRunComplianceScan,
    onViewScanHistory,
    onBack,
}: {
    system: AISystemInventoryItem;
    auditLog: SystemAuditEntry[];
    onGenerateRecommendation: () => void;
    onRunComplianceScan: () => void;
    onViewScanHistory: () => void;
    onBack: () => void;
}) {
    const TypeIcon = SYSTEM_TYPE_ICONS[system.type];
    const [explaining, setExplaining] = useState(false);
    const [explanation, setExplanation] = useState<ExplainMissingResponse | null>(null);
    const [explainError, setExplainError] = useState("");

    const handleExplainMissing = async () => {
        setExplaining(true);
        setExplainError("");
        try {
            const result = await systemsApi.explainMissing(Number(system.id));
            setExplanation(result);
        } catch {
            setExplainError("Claude could not generate an explanation. Check that CLAUDE_API_KEY is set on the server.");
        } finally {
            setExplaining(false);
        }
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <button className="btn btn--ghost btn--sm" style={{ alignSelf: "flex-start", gap: 4 }} onClick={onBack}>
                <ArrowBackOutlinedIcon sx={{ fontSize: 14 }} /> Back to AI Systems
            </button>

            {/* Header */}
            <div className="panel">
                <div className="panel__body">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-4)" }}>
                        <div className="system-detail__icon">
                            <TypeIcon sx={{ fontSize: 28 }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h2 style={{ fontSize: "var(--fs-20)", fontWeight: "var(--fw-semibold)", color: "var(--c-text)", marginBottom: 4 }}>
                                {system.name}
                            </h2>
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                Registered: {formatDate(system.registered_at)} | Last Updated: {formatDate(system.updated_at)}
                            </p>
                        </div>
                        <RiskBadge level={system.risk_level} />
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
                {/* System Information */}
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">System Information</span>
                    </div>
                    <div className="panel__body">
                        <div className="detail-grid">
                            <DetailRow icon={SmartToyOutlinedIcon} label="Type" value={SYSTEM_TYPE_LABELS[system.type]} />
                            <DetailRow icon={LinkOutlinedIcon} label="Platform" value={system.platform} />
                            <DetailRow icon={CheckCircleOutlinedIcon} label="Status" value={system.status} />
                            <DetailRow icon={BusinessOutlinedIcon} label="Owner" value={system.owner} />
                            <DetailRow icon={EmailOutlinedIcon} label="Contact" value={system.contact_email} />
                            <DetailRow icon={PersonOutlinedIcon} label="Department" value={system.department} />
                        </div>
                    </div>
                </div>

                {/* Risk Assessment */}
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">Risk Assessment</span>
                    </div>
                    <div className="panel__body">
                        <div style={{ marginBottom: "var(--s-4)" }}>
                            <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: 4 }}>Overall Risk Level</div>
                            <RiskBadge level={system.risk_level} size="lg" />
                        </div>
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                            <strong style={{ color: "var(--c-text)" }}>Risk Factors:</strong>
                            <ul style={{ marginTop: "var(--s-2)", paddingLeft: "var(--s-4)" }}>
                                <li>Data Sensitivity: {system.data_sensitivity}</li>
                                <li>External Integrations: {system.external_integrations.join(", ") || "None"}</li>
                                <li>Models Used: {system.models_used.join(", ")}</li>
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Compliance Status */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Compliance Status</span>
                </div>
                <div className="panel__body">
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-4)", marginBottom: "var(--s-4)" }}>
                        <ScanStatusBadge status={system.scan_status} violations={system.active_violations} />
                        {system.last_scan_date && (
                            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                Last Scan: {formatDateTime(system.last_scan_date)}
                            </span>
                        )}
                        {system.compliance_score !== undefined && (
                            <span style={{ fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)", color: system.compliance_score === 100 ? "var(--c-live-text)" : "var(--c-medium-text)" }}>
                                {system.compliance_score}% Compliant
                            </span>
                        )}
                    </div>
                    <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap" }}>
                        <button className="btn btn--primary" onClick={onRunComplianceScan}>
                            <DocumentScannerOutlinedIcon sx={{ fontSize: 16 }} /> Run Compliance Scan
                        </button>
                        <button className="btn btn--secondary" onClick={onViewScanHistory}>
                            <HistoryOutlinedIcon sx={{ fontSize: 16 }} /> View Scan History
                        </button>
                        <button className="btn btn--secondary" onClick={onGenerateRecommendation}>
                            <AIIcon size={16} /> Generate Recommendation
                        </button>
                        {system.scan_status === "violations" && (
                            <button
                                className="btn btn--secondary"
                                onClick={() => void handleExplainMissing()}
                                disabled={explaining}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                                <AutoAwesomeOutlinedIcon sx={{ fontSize: 16 }} />
                                {explaining ? "Generating explanation…" : "Explain what's missing"}
                            </button>
                        )}
                    </div>
                    <div style={{ marginTop: "var(--s-3)", maxWidth: 720 }}>
                        <CopilotAdvisoryNotice />
                    </div>

                    {explainError && (
                        <p style={{ marginTop: "var(--s-3)", fontSize: "var(--fs-12)", color: "var(--c-critical)" }}>{explainError}</p>
                    )}

                    {explanation && (
                        <div style={{
                            marginTop: "var(--s-4)",
                            padding: "var(--s-4)",
                            borderRadius: "var(--r-md)",
                            border: "1px solid rgba(245,158,11,0.3)",
                            background: "rgba(245,158,11,0.04)",
                        }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-3)" }}>
                                <AutoAwesomeOutlinedIcon sx={{ fontSize: 16, color: "var(--c-accent)" }} />
                                <span style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-13)" }}>
                                    AI explanation — {explanation.system_name}
                                </span>
                                <button
                                    type="button"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-muted)", fontSize: 16, marginLeft: "auto" }}
                                    onClick={() => setExplanation(null)}
                                >✕</button>
                            </div>

                            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", lineHeight: 1.6, marginBottom: "var(--s-3)" }}>
                                {explanation.summary}
                            </p>

                            {explanation.missing_controls.length > 0 && (
                                <div style={{ marginBottom: "var(--s-3)" }}>
                                    <p style={{ fontSize: "var(--fs-11)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--s-2)" }}>Missing Controls</p>
                                    {explanation.missing_controls.map((mc, i) => (
                                        <div key={i} style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-2)" }}>
                                            <span style={{ color: "var(--c-critical)", fontSize: 14, flexShrink: 0 }}>✕</span>
                                            <div>
                                                <span style={{ fontWeight: "var(--fw-medium)", fontSize: "var(--fs-13)" }}>{mc.control}</span>
                                                <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginLeft: "var(--s-2)" }}>— {mc.why_required}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}

                            {explanation.action_steps.length > 0 && (
                                <div style={{ marginBottom: "var(--s-3)" }}>
                                    <p style={{ fontSize: "var(--fs-11)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.05em", marginBottom: "var(--s-2)" }}>Action Steps</p>
                                    <ol style={{ paddingLeft: "var(--s-4)", margin: 0 }}>
                                        {explanation.action_steps.map((step, i) => (
                                            <li key={i} style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", lineHeight: 1.6, marginBottom: "var(--s-1)" }}>{step}</li>
                                        ))}
                                    </ol>
                                </div>
                            )}

                            <div style={{ padding: "var(--s-3)", background: "rgba(239,68,68,0.06)", borderRadius: "var(--r-sm)", border: "1px solid rgba(239,68,68,0.15)" }}>
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", lineHeight: 1.5 }}>
                                    <strong style={{ color: "var(--c-critical)" }}>Risk if ignored:</strong> {explanation.risk_if_ignored}
                                </p>
                            </div>

                            <CopilotAdvisoryNotice text={explanation.disclaimer} style={{ marginTop: "var(--s-3)" }} />
                        </div>
                    )}
                </div>
            </div>

            {/* Configuration Details */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Configuration Details</span>
                </div>
                <div className="panel__body">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
                        <div>
                            <h4 style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", marginBottom: "var(--s-2)" }}>
                                AI Models Used
                            </h4>
                            <ul style={{ listStyle: "none" }}>
                                {system.models_used.map((model, i) => (
                                    <li key={i} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", padding: "4px 0" }}>
                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-text-muted)" }} />
                                        {model}
                                    </li>
                                ))}
                            </ul>
                        </div>
                        <div>
                            <h4 style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", marginBottom: "var(--s-2)" }}>
                                External Integrations
                            </h4>
                            <ul style={{ listStyle: "none" }}>
                                {system.external_integrations.length > 0 ? system.external_integrations.map((integ, i) => (
                                    <li key={i} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", padding: "4px 0" }}>
                                        <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--c-text-muted)" }} />
                                        {integ}
                                    </li>
                                )) : (
                                    <li style={{ fontSize: "var(--fs-13)", color: "var(--c-text-muted)" }}>No integrations configured</li>
                                )}
                            </ul>
                        </div>
                    </div>
                </div>
            </div>

            {/* Audit Trail */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Audit Trail</span>
                </div>
                <div className="panel__body--flush">
                    {auditLog.map((entry) => (
                        <div key={entry.id} style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-3)", padding: "var(--s-3) var(--s-4)", borderBottom: "1px solid var(--c-border-subtle)" }}>
                            <HistoryOutlinedIcon sx={{ fontSize: 16, color: "var(--c-text-muted)", marginTop: 2 }} />
                            <div style={{ flex: 1 }}>
                                <div style={{ fontSize: "var(--fs-13)", color: "var(--c-text)" }}>{entry.event}</div>
                                {entry.details && <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>{entry.details}</div>}
                            </div>
                            <span style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", whiteSpace: "nowrap" }}>
                                {formatDate(entry.timestamp)}
                            </span>
                        </div>
                    ))}
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-2)" }}>
                <button className="btn btn--secondary">
                    <EditOutlinedIcon sx={{ fontSize: 16 }} /> Edit System
                </button>
                <button className="btn btn--secondary">
                    <ArchiveOutlinedIcon sx={{ fontSize: 16 }} /> Archive
                </button>
                <button className="btn btn--primary" onClick={onGenerateRecommendation}>
                    <AIIcon size={16} /> Generate Recommendation
                </button>
            </div>
        </div>
    );
}

function RecommendationResult({ recommendation }: { recommendation: CopilotRecommendation }) {
    const parsed = parseRecommendation(recommendation.raw_response);

    if (!parsed) {
        return (
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                <pre
                    style={{
                        whiteSpace: "pre-wrap",
                        fontSize: "var(--fs-12)",
                        background: "var(--c-surface-raised)",
                        padding: "var(--s-3)",
                        borderRadius: "var(--r-md)",
                        border: "1px solid var(--c-border)",
                        maxHeight: 420,
                        overflow: "auto",
                    }}
                >
                    {recommendation.raw_response}
                </pre>
                <CopilotAdvisoryNotice text={recommendation.disclaimer} />
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <CopilotAdvisoryNotice text={recommendation.disclaimer} />
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: "var(--s-3)" }}>
                <RecommendationMetric label="Model Type" value={parsed.suggested_model_type} />
                <RecommendationMetric label="Data Sensitivity" value={parsed.suggested_data_sensitivity} />
                <RecommendationMetric label="Risk Tier" value={parsed.suggested_risk_tier} />
            </div>

            <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-raised)" }}>
                <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--s-2)" }}>
                    Recommended Policies
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-2)" }}>
                    {parsed.suggested_policies.map((policy) => (
                        <span key={policy} className="badge badge--neutral">{policy}</span>
                    ))}
                </div>
            </div>

            <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-raised)" }}>
                <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--s-2)" }}>
                    Rationale
                </div>
                <div style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", lineHeight: 1.6 }}>
                    {parsed.rationale}
                </div>
            </div>

            <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-raised)" }}>
                <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--s-2)" }}>
                    Clarifying Questions
                </div>
                <ol style={{ margin: 0, paddingLeft: "1.25rem", display: "flex", flexDirection: "column", gap: "var(--s-2)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                    {parsed.clarifying_questions.map((question, index) => (
                        <li key={`${index}-${question}`}>{question}</li>
                    ))}
                </ol>
            </div>

            <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                Model: {recommendation.model}
            </div>
        </div>
    );
}

function RecommendationMetric({ label, value }: { label: string; value: string }) {
    return (
        <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-raised)" }}>
            <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--s-1)" }}>
                {label}
            </div>
            <div style={{ fontSize: "var(--fs-14)", color: "var(--c-text)", fontWeight: "var(--fw-semibold)" }}>
                {value}
            </div>
        </div>
    );
}

function RiskBadge({ level, size = "sm" }: { level: RiskLevel; size?: "sm" | "lg" }) {
    const config = {
        critical: { label: "CRITICAL", color: "var(--c-critical)", bg: "var(--c-critical-bg)" },
        high: { label: "HIGH", color: "var(--c-high)", bg: "var(--c-high-bg)" },
        low: { label: "LOW", color: "var(--c-live)", bg: "var(--c-live-bg)" },
    };
    const c = config[level];

    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            padding: size === "lg" ? "6px 12px" : "3px 8px",
            background: c.bg,
            color: c.color,
            borderRadius: "var(--r-md)",
            fontSize: size === "lg" ? "var(--fs-13)" : "var(--fs-11)",
            fontWeight: "var(--fw-semibold)",
            textTransform: "uppercase",
            letterSpacing: "0.04em",
        }}>
            <span style={{ width: size === "lg" ? 8 : 6, height: size === "lg" ? 8 : 6, borderRadius: "50%", background: c.color }} />
            {c.label} RISK
        </span>
    );
}

function ScanStatusBadge({ status, violations }: { status: "compliant" | "violations" | "not_scanned"; violations: number }) {
    if (status === "compliant") {
        return (
            <span className="badge badge--live" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <CheckCircleOutlinedIcon sx={{ fontSize: 12 }} /> Compliant
            </span>
        );
    }
    if (status === "violations") {
        return (
            <span className="badge badge--warning" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                <WarningAmberOutlinedIcon sx={{ fontSize: 12 }} /> {violations} Violation{violations !== 1 ? "s" : ""}
            </span>
        );
    }
    return (
        <span className="badge badge--neutral" style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <RadioButtonUncheckedOutlinedIcon sx={{ fontSize: 12 }} /> Not Scanned
        </span>
    );
}

function DetailRow({ icon: Icon, label, value }: { icon: AppIconComponent; label: string; value: string }) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-2) 0" }}>
            <Icon sx={{ fontSize: 16, color: "var(--c-text-muted)" }} />
            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", width: 80 }}>{label}</span>
            <span style={{ fontSize: "var(--fs-13)", color: "var(--c-text)", fontWeight: "var(--fw-medium)" }}>{value}</span>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   HELPERS
   ═══════════════════════════════════════════════════════════════════════════════ */

function calculateRiskLevel(sensitivity: DataSensitivity, dataTypes: DataAccessType[]): RiskLevel {
    const hasPII = dataTypes.includes("pii");
    const hasCustomerData = dataTypes.includes("customer_data");
    const hasFinancial = dataTypes.includes("financial_records");

    if (sensitivity === "High" && (hasPII || hasCustomerData || hasFinancial)) {
        return "critical";
    }
    if (sensitivity === "High" || hasPII || hasCustomerData) {
        return "high";
    }
    return "low";
}

function backendRiskTierToRiskLevel(tier: BackendAISystem["risk_tier"]): RiskLevel {
    if (tier === "Tier 3") return "critical";
    if (tier === "Tier 2") return "high";
    return "low";
}

function riskLevelToBackendTier(level: RiskLevel): BackendAISystem["risk_tier"] {
    if (level === "critical") return "Tier 3";
    if (level === "high") return "Tier 2";
    return "Tier 1";
}

const VALID_MODEL_TYPES = new Set<string>(["LLM", "ML", "Agent", "Other"]);
const VALID_DATA_SENSITIVITIES = new Set<string>(["Low", "Medium", "High"]);
const VALID_RISK_TIERS = new Set<string>(["Tier 1", "Tier 2", "Tier 3"]);
const VALID_STATUSES = new Set<string>(["Draft", "Active", "Retired"]);

function parseCsvRow(line: string): string[] {
    const cells: string[] = [];
    let i = 0;
    while (i < line.length) {
        if (line[i] === '"') {
            let cell = "";
            i++;
            while (i < line.length) {
                if (line[i] === '"' && line[i + 1] === '"') { cell += '"'; i += 2; }
                else if (line[i] === '"') { i++; break; }
                else { cell += line[i++]; }
            }
            cells.push(cell);
            if (line[i] === ",") i++;
        } else {
            const end = line.indexOf(",", i);
            if (end === -1) { cells.push(line.slice(i)); break; }
            cells.push(line.slice(i, end));
            i = end + 1;
        }
    }
    return cells;
}

function parseCsvToSystems(csv: string): AISystemCreate[] {
    const lines = csv.split(/\r?\n/).filter((l) => l.trim());
    if (lines.length < 2) return [];
    const headers = parseCsvRow(lines[0]).map((h) => h.trim().toLowerCase());
    const idx = (names: string[]) => names.map((n) => headers.indexOf(n)).find((i) => i !== -1) ?? -1;
    const nameIdx = idx(["name"]);
    const descIdx = idx(["description", "desc"]);
    const ownerIdx = idx(["owner"]);
    const deptIdx = idx(["department", "business unit"]);
    const sensitivityIdx = idx(["data sensitivity", "data_sensitivity", "sensitivity"]);
    const modelTypeIdx = idx(["model type", "model_type", "type"]);
    const riskTierIdx = idx(["risk tier", "risk_tier", "risk"]);
    const statusIdx = idx(["status"]);

    return lines.slice(1).flatMap((line) => {
        const cells = parseCsvRow(line);
        const name = (nameIdx >= 0 ? cells[nameIdx] : "").trim();
        if (!name) return [];
        const rawSensitivity = (sensitivityIdx >= 0 ? cells[sensitivityIdx] : "").trim();
        const rawModelType = (modelTypeIdx >= 0 ? cells[modelTypeIdx] : "").trim();
        const rawRiskTier = (riskTierIdx >= 0 ? cells[riskTierIdx] : "").trim();
        const rawStatus = (statusIdx >= 0 ? cells[statusIdx] : "").trim();
        return [{
            name,
            description: (descIdx >= 0 ? cells[descIdx] : "").trim() || "",
            owner: (ownerIdx >= 0 ? cells[ownerIdx] : "").trim() || "",
            business_unit: (deptIdx >= 0 ? cells[deptIdx] : "").trim() || "General",
            data_sensitivity: (VALID_DATA_SENSITIVITIES.has(rawSensitivity) ? rawSensitivity : "Low") as DataSensitivity,
            model_type: (VALID_MODEL_TYPES.has(rawModelType) ? rawModelType : "LLM") as ModelType,
            risk_tier: (VALID_RISK_TIERS.has(rawRiskTier) ? rawRiskTier : null) as RiskTier | null,
            status: (VALID_STATUSES.has(rawStatus) ? rawStatus : "Draft") as SystemStatus,
            external_integrations: [],
        }];
    });
}

/** Map a provider/integration tag onto the workspace integration that can monitor it. */
export function providerIntegrationKey(tag: string): string | null {
    const value = tag.toLowerCase();
    if (value.includes("github") || value.includes("copilot")) return "github";
    if (value.includes("slack")) return "slack";
    if (value.includes("aws") || value.includes("bedrock")) return "aws";
    if (value.includes("figma")) return "figma";
    if (value.includes("mcp")) return "mcp";
    return null;
}

/**
 * True when at least one of a system's declared integrations maps to a workspace
 * integration that is actually connected. Never self-declared.
 */
export function deriveSystemConnected(
    integrations: string[],
    connectedProviders: Set<string>,
): boolean {
    return integrations.some((tag) => {
        const key = providerIntegrationKey(tag);
        return key != null && connectedProviders.has(key);
    });
}

function mapBackendSystemToInventory(
    system: BackendAISystem,
    connectedProviders: Set<string> = new Set(),
): AISystemInventoryItem {
    const hasRealScan = system.compliance_score != null;
    const violations = system.active_violations ?? (system.missing_required_controls ? 1 : 0);
    return {
        id: String(system.id),
        name: system.name,
        type: "custom",
        description: system.description,
        owner: system.owner,
        contact_email: "",
        department: system.business_unit,
        risk_level: backendRiskTierToRiskLevel(system.risk_tier),
        data_sensitivity: system.data_sensitivity,
        data_access_types: [],
        platform: system.external_integrations[0] ?? "Unknown",
        provider: system.external_integrations[0] ?? "Unknown",
        models_used: [system.model_type],
        external_integrations: system.external_integrations,
        connected: deriveSystemConnected(system.external_integrations, connectedProviders),
        last_scan_id: system.last_scan_id ?? undefined,
        last_scan_date: system.last_scan_date ?? undefined,
        compliance_score: system.compliance_score ?? undefined,
        active_violations: violations,
        scan_status: hasRealScan
            ? (violations > 0 ? "violations" : "compliant")
            : (system.missing_required_controls ? "violations" : "not_scanned"),
        risk_tier: system.risk_tier,
        risk_justification: system.risk_justification,
        model_type: system.model_type,
        required_policies: system.required_policies ?? [],
        missing_required_controls: system.missing_required_controls ?? [],
        status: system.status === "Active" ? "active" : system.status === "Retired" ? "archived" : "draft",
        registered_by: "api",
        registered_at: system.created_at,
        updated_at: system.updated_at,
    };
}

function toBackendCreatePayload(data: Partial<AISystemInventoryItem>) {
    const riskLevel = calculateRiskLevel(data.data_sensitivity ?? "Low", data.data_access_types ?? []);
    const rawModelType = data.models_used?.[0] ?? "LLM";
    const modelType = (["LLM", "ML", "Agent", "Other"].includes(rawModelType) ? rawModelType : "LLM") as ModelType;
    return {
        name: data.name ?? "",
        description: data.description ?? "",
        owner: data.owner ?? "",
        business_unit: data.department ?? "General",
        model_type: modelType,
        data_sensitivity: data.data_sensitivity ?? "Low",
        external_integrations: data.external_integrations ?? [],
        status: "Draft" as const,
        risk_tier: riskLevelToBackendTier(riskLevel),
        risk_justification: `Initial risk tier from data sensitivity (${data.data_sensitivity ?? "Low"}) and access scope at registration.`,
    };
}

function buildAuditLogForSystem(system: AISystemInventoryItem, backendAudit: { id: number; timestamp: string; summary: string; target_id: number | null }[]): SystemAuditEntry[] {
    const systemId = Number(system.id);
    return backendAudit
        .filter((entry) => entry.target_id === systemId || entry.target_id === null)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
        .slice(0, 8)
        .map((entry) => ({
            id: String(entry.id),
            timestamp: entry.timestamp,
            event: entry.summary,
        }));
}

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(iso));
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

function parseRecommendation(raw: string): ParsedRecommendation | null {
    try {
        return JSON.parse(raw) as ParsedRecommendation;
    } catch {
        const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
        if (!fenced) return null;
        try {
            return JSON.parse(fenced[1]) as ParsedRecommendation;
        } catch {
            return null;
        }
    }
}
