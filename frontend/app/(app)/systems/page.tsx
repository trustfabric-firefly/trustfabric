"use client";

import { useState, useCallback, useMemo, useEffect } from "react";
import { useRouter } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import RadioButtonUncheckedOutlinedIcon from "@mui/icons-material/RadioButtonUncheckedOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import ArchiveOutlinedIcon from "@mui/icons-material/ArchiveOutlined";
import DocumentScannerOutlinedIcon from "@mui/icons-material/DocumentScannerOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import EmailOutlinedIcon from "@mui/icons-material/EmailOutlined";
import CodeOutlinedIcon from "@mui/icons-material/CodeOutlined";
import ChatOutlinedIcon from "@mui/icons-material/ChatOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import CreateOutlinedIcon from "@mui/icons-material/CreateOutlined";
import ExtensionOutlinedIcon from "@mui/icons-material/ExtensionOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import type { SvgIconComponent } from "@mui/icons-material";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import { TopBar } from "@/components/layout/TopBar";
import { Modal } from "@/components/ui/Modal";
import { AIIcon } from "@/components/ui/AIIcon";
import { auditApi, copilotApi, systemsApi, type ExplainMissingResponse } from "@/lib/api";
import type {
    AISystemInventoryItem,
    AISystemType,
    CopilotRecommendation,
    DataSensitivity,
    DataAccessType,
    ParsedRecommendation,
    RiskLevel,
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

const SYSTEM_TYPE_ICONS: Record<AISystemType, SvgIconComponent> = {
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

/* ═══════════════════════════════════════════════════════════════════════════════
   MOCK DATA
   ═══════════════════════════════════════════════════════════════════════════════ */

const MOCK_SYSTEMS: AISystemInventoryItem[] = [
    {
        id: "sys_001",
        name: "ChatGPT Enterprise",
        type: "chat_interface",
        description: "Enterprise ChatGPT subscription for customer support team to handle inquiries and generate responses.",
        owner: "Support Team",
        contact_email: "support-lead@acme-corp.com",
        department: "Customer Support",
        risk_level: "critical",
        data_sensitivity: "High",
        data_access_types: ["customer_data", "pii"],
        platform: "OpenAI",
        provider: "OpenAI",
        models_used: ["GPT-4", "GPT-4 Turbo"],
        external_integrations: ["Zendesk", "Slack"],
        connected: false,
        active_violations: 2,
        scan_status: "violations",
        last_scan_date: "2026-02-15T14:35:00Z",
        compliance_score: 67,
        status: "active",
        registered_by: "admin@acme-corp.com",
        registered_at: "2026-01-10T10:00:00Z",
        updated_at: "2026-02-15T14:35:00Z",
    },
    {
        id: "sys_002",
        name: "GitHub Copilot",
        type: "code_assistant",
        description: "AI-powered code completion and suggestions for the engineering team across all repositories.",
        owner: "Engineering Team",
        contact_email: "engineering@acme-corp.com",
        department: "Engineering",
        risk_level: "high",
        data_sensitivity: "High",
        data_access_types: ["proprietary_source_code"],
        platform: "GitHub",
        provider: "GitHub",
        models_used: ["Claude 3.5 Sonnet", "GPT-3.5 Turbo"],
        external_integrations: ["Slack", "Jira"],
        connected: true,
        connection_type: "github_api",
        active_violations: 0,
        scan_status: "compliant",
        last_scan_date: "2026-02-16T14:35:00Z",
        compliance_score: 100,
        status: "active",
        registered_by: "admin@acme-corp.com",
        registered_at: "2026-01-05T09:00:00Z",
        updated_at: "2026-02-16T14:35:00Z",
    },
    {
        id: "sys_003",
        name: "Midjourney",
        type: "design_tool",
        description: "AI image generation for marketing materials and brand assets.",
        owner: "Design Team",
        contact_email: "design@acme-corp.com",
        department: "Marketing",
        risk_level: "high",
        data_sensitivity: "Medium",
        data_access_types: ["internal_docs"],
        platform: "Discord",
        provider: "Midjourney",
        models_used: ["Midjourney v6"],
        external_integrations: ["Figma"],
        connected: false,
        active_violations: 0,
        scan_status: "not_scanned",
        status: "active",
        registered_by: "design@acme-corp.com",
        registered_at: "2026-01-20T11:00:00Z",
        updated_at: "2026-01-20T11:00:00Z",
    },
    {
        id: "sys_004",
        name: "Grammarly Business",
        type: "writing_assistant",
        description: "AI writing assistant for content creation and editing.",
        owner: "Content Team",
        contact_email: "content@acme-corp.com",
        department: "Marketing",
        risk_level: "low",
        data_sensitivity: "Low",
        data_access_types: ["public_data"],
        platform: "Grammarly",
        provider: "Grammarly",
        models_used: ["Grammarly AI"],
        external_integrations: ["Google Docs", "Microsoft Word"],
        connected: false,
        active_violations: 0,
        scan_status: "compliant",
        last_scan_date: "2026-02-14T10:00:00Z",
        compliance_score: 100,
        status: "active",
        registered_by: "marketing@acme-corp.com",
        registered_at: "2026-01-25T14:00:00Z",
        updated_at: "2026-02-14T10:00:00Z",
    },
    {
        id: "sys_005",
        name: "Notion AI",
        type: "productivity",
        description: "AI features in Notion for documentation and meeting notes.",
        owner: "IT Department",
        contact_email: "it@acme-corp.com",
        department: "All Teams",
        risk_level: "low",
        data_sensitivity: "Medium",
        data_access_types: ["internal_docs"],
        platform: "Notion",
        provider: "Notion",
        models_used: ["Claude", "GPT-4"],
        external_integrations: ["Slack", "Google Calendar"],
        connected: false,
        active_violations: 0,
        scan_status: "compliant",
        last_scan_date: "2026-02-15T09:00:00Z",
        compliance_score: 100,
        status: "active",
        registered_by: "it@acme-corp.com",
        registered_at: "2026-02-01T10:00:00Z",
        updated_at: "2026-02-15T09:00:00Z",
    },
];

const MOCK_AUDIT_LOG: SystemAuditEntry[] = [
    { id: "aud_001", timestamp: "2026-02-16T14:35:00Z", event: "Compliance scan passed (100%)" },
    { id: "aud_002", timestamp: "2026-02-15T09:15:00Z", event: "Compliance scan passed (100%)" },
    { id: "aud_003", timestamp: "2026-02-10T11:30:00Z", event: "Configuration updated", details: "CLI features disabled" },
    { id: "aud_004", timestamp: "2026-02-05T14:20:00Z", event: "Compliance scan failed (67%)", details: "2 policy violations detected" },
    { id: "aud_005", timestamp: "2026-01-15T10:00:00Z", event: "System registered" },
];

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

    const { data: backendSystems = [] } = useQuery({
        queryKey: ["systems"],
        queryFn: systemsApi.list,
    });
    const { data: backendAudit = [] } = useQuery({
        queryKey: ["audit"],
        queryFn: auditApi.list,
    });

    const createSystemMutation = useMutation({
        mutationFn: systemsApi.create,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["systems"] }),
    });
    const runScanMutation = useMutation({
        mutationFn: copilotApi.recommend,
    });

    useEffect(() => {
        setSystems(backendSystems.map(mapBackendSystemToInventory));
    }, [backendSystems]);

    const hasSystems = systems.length > 0;

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

    const handleOpenComplianceScans = useCallback(() => {
        router.push("/scans?start=config");
    }, [router]);

    const handleViewScanHistory = useCallback((system: AISystemInventoryItem) => {
        if (system.last_scan_id) {
            router.push(`/scans?scanId=${encodeURIComponent(system.last_scan_id)}`);
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

    // Stats
    const criticalCount = systems.filter((s) => s.risk_level === "critical").length;
    const highCount = systems.filter((s) => s.risk_level === "high").length;
    const lowCount = systems.filter((s) => s.risk_level === "low").length;

    return (
        <>
            <TopBar
                title="AI Systems Inventory"
                subtitle={hasSystems ? `${systems.length} systems registered` : undefined}
                actions={
                    view === "list" && hasSystems ? (
                        <button className="btn btn--primary" onClick={handleRegister}>
                            <AddOutlinedIcon sx={{ fontSize: 16 }} /> Register New System
                </button>
                    ) : undefined
                }
            />

            <main className="page">
                {view === "list" && (
                    <ListView
                        systems={systems}
                        hasSystems={hasSystems}
                        criticalCount={criticalCount}
                        highCount={highCount}
                        lowCount={lowCount}
                        onRegister={handleRegister}
                        onViewDetails={handleViewDetails}
                        onRunScan={handleRunScan}
                    />
                )}

                {view === "register" && (
                    <RegisterView
                        onCancel={handleBack}
                        onSave={handleSaveSystem}
                    />
                )}

                {view === "details" && selectedSystem && (
                    <DetailsView
                        system={selectedSystem}
                        auditLog={buildAuditLogForSystem(selectedSystem, backendAudit)}
                        onGenerateRecommendation={() => handleRunScan(selectedSystem)}
                        onRunComplianceScan={handleOpenComplianceScans}
                        onViewScanHistory={() => handleViewScanHistory(selectedSystem)}
                        onBack={handleBack}
                    />
                )}
            </main>
            <Modal
                open={recommendationModalOpen}
                onClose={handleCloseRecommendationModal}
                title={`Recommendation: ${scanSystemName || "System"}`}
                subtitle="NIST AI RMF system recommendation"
                footer={
                    <div style={{ display: "flex", justifyContent: "space-between", width: "100%", gap: "var(--s-2)" }}>
                        <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                            {runScanMutation.isPending ? "You can close this and keep working while the request finishes." : "Review the guidance before updating the system record."}
                        </div>
                        <button
                            className="btn btn--primary btn--sm"
                            onClick={handleCloseRecommendationModal}
                        >
                            Close
                        </button>
                    </div>
                }
            >
                {runScanMutation.isPending && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                            Generating recommendation...
                        </div>
                        <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                            This evaluates the selected system and suggests risk tier, data sensitivity, policies, and follow-up questions.
                        </div>
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
        </>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   LIST VIEW
   ═══════════════════════════════════════════════════════════════════════════════ */

function ListView({
    systems,
    hasSystems,
    criticalCount,
    highCount,
    lowCount,
    onRegister,
    onViewDetails,
    onRunScan,
}: {
    systems: AISystemInventoryItem[];
    hasSystems: boolean;
    criticalCount: number;
    highCount: number;
    lowCount: number;
    onRegister: () => void;
    onViewDetails: (system: AISystemInventoryItem) => void;
    onRunScan: (system: AISystemInventoryItem) => void;
}) {
    const [search, setSearch] = useState("");
    const [riskFilter, setRiskFilter] = useState<"all" | RiskLevel>("all");

    const filtered = useMemo(() => {
        return systems
            .filter((s) => riskFilter === "all" || s.risk_level === riskFilter)
            .filter((s) =>
                !search ||
                s.name.toLowerCase().includes(search.toLowerCase()) ||
                s.description.toLowerCase().includes(search.toLowerCase()) ||
                s.owner.toLowerCase().includes(search.toLowerCase())
            );
    }, [systems, riskFilter, search]);

    const criticalSystems = filtered.filter((s) => s.risk_level === "critical");
    const highSystems = filtered.filter((s) => s.risk_level === "high");
    const lowSystems = filtered.filter((s) => s.risk_level === "low");

    if (!hasSystems) {
        return (
            <div className="panel">
                <EmptyState onRegister={onRegister} />
            </div>
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            {/* Overview Stats */}
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <div className="stat-card stat-card--info">
                    <div className="stat-card__label">Total Systems</div>
                    <div className="stat-card__value">{systems.length}</div>
                </div>
                <div className="stat-card stat-card--danger">
                    <div className="stat-card__label">Critical + High Risk</div>
                    <div className="stat-card__value">{criticalCount + highCount}</div>
                </div>
                <div className="stat-card stat-card--success">
                    <div className="stat-card__label">Low Risk</div>
                    <div className="stat-card__value">{lowCount}</div>
                </div>
            </div>

            {/* Risk Distribution */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Risk Distribution</span>
                </div>
                <div className="panel__body">
                    <RiskDistributionBar
                        critical={criticalCount}
                        high={highCount}
                        low={lowCount}
                        total={systems.length}
                    />
                </div>
            </div>

            {/* Systems List */}
                <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Registered Systems</span>
                </div>

                {/* Search & Filter */}
                <div style={{ padding: "var(--s-3) var(--s-4)", borderBottom: "1px solid var(--c-border)", display: "flex", gap: "var(--s-3)", alignItems: "center" }}>
                    <div className="search-bar" style={{ flex: 1 }}>
                        <span className="search-bar__icon"><SearchOutlinedIcon sx={{ fontSize: 16 }} /></span>
                        <input className="input" placeholder="Search systems..." value={search} onChange={(e) => setSearch(e.target.value)} />
                    </div>
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                        <FilterListOutlinedIcon sx={{ fontSize: 16, color: "var(--c-text-muted)" }} />
                        <select
                            className="input"
                            style={{ width: 140, padding: "6px 10px" }}
                            value={riskFilter}
                            onChange={(e) => setRiskFilter(e.target.value as typeof riskFilter)}
                        >
                            <option value="all">All Risk Levels</option>
                            <option value="critical">Critical</option>
                            <option value="high">High</option>
                            <option value="low">Low</option>
                        </select>
                    </div>
                </div>

                    <div className="panel__body--flush">
                    {filtered.length === 0 ? (
                        <div className="empty-state" style={{ padding: "var(--s-6)" }}>
                            <p className="empty-state__desc">No systems match your search.</p>
                            </div>
                        ) : (
                        <>
                            {criticalSystems.length > 0 && (
                                <SystemGroup label="CRITICAL RISK" systems={criticalSystems} onViewDetails={onViewDetails} onRunScan={onRunScan} />
                            )}
                            {highSystems.length > 0 && (
                                <SystemGroup label="HIGH RISK" systems={highSystems} onViewDetails={onViewDetails} onRunScan={onRunScan} />
                            )}
                            {lowSystems.length > 0 && (
                                <SystemGroup label="LOW RISK" systems={lowSystems} onViewDetails={onViewDetails} onRunScan={onRunScan} />
                            )}
                        </>
                    )}

                    <div style={{ padding: "var(--s-3) var(--s-4)", fontSize: "var(--fs-11)", color: "var(--c-text-muted)", borderTop: "1px solid var(--c-border)" }}>
                        Showing {filtered.length} of {systems.length} systems
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   EMPTY STATE
   ═══════════════════════════════════════════════════════════════════════════════ */

function EmptyState({ onRegister }: { onRegister: () => void }) {
    return (
        <div className="scan-empty">
            <div className="scan-empty__icon">
                <SmartToyOutlinedIcon sx={{ fontSize: 32 }} />
            </div>
            <h2 className="scan-empty__title">Register Your First AI System</h2>
            <p className="scan-empty__desc">
                Begin compliance monitoring by cataloging the AI tools
                your organization uses. Track risk, ownership, and policies.
            </p>
            <button className="btn btn--primary btn--lg" onClick={onRegister}>
                <AddOutlinedIcon sx={{ fontSize: 18 }} /> Register AI System
            </button>

            <div className="scan-info" style={{ marginTop: "var(--s-8)" }}>
                <h4 className="scan-info__title">
                    <InfoOutlinedIcon sx={{ fontSize: 16 }} /> What is an AI System?
                </h4>
                <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", lineHeight: 1.6, marginBottom: "var(--s-3)" }}>
                    Any AI-powered tool or service your organization uses:
                </p>
                <ul style={{ listStyle: "none", display: "flex", flexDirection: "column", gap: "var(--s-2)", marginBottom: "var(--s-4)" }}>
                    {[
                        { icon: CodeOutlinedIcon, text: "Code assistants (GitHub Copilot, Cursor)" },
                        { icon: ChatOutlinedIcon, text: "Chat interfaces (ChatGPT, Claude)" },
                        { icon: BrushOutlinedIcon, text: "Design tools (Midjourney, DALL-E)" },
                        { icon: BarChartOutlinedIcon, text: "Analytics platforms (DataRobot, H2O.ai)" },
                    ].map((item, i) => (
                        <li key={i} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                            <item.icon sx={{ fontSize: 16, color: "var(--c-text-muted)" }} />
                            {item.text}
                        </li>
                    ))}
                </ul>
                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                    For each system, you&apos;ll define what it&apos;s used for, who owns it, what data it accesses, and its risk level.
                </p>
            </div>
        </div>
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
}: {
    onCancel: () => void;
    onSave: (data: Partial<AISystemInventoryItem>) => void;
}) {
    const [form, setForm] = useState<FormState>(EMPTY_FORM);

    const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
        setForm((f) => ({ ...f, [key]: value }));
    };

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
            connected: form.connected,
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
                                <h4 className="form-section-title">Connection (Optional)</h4>
                                <label className="checkbox-label" style={{ padding: "var(--s-3)", background: "var(--c-surface-raised)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" }}>
                                    <input
                                        type="checkbox"
                                        checked={form.connected}
                                        onChange={(e) => set("connected", e.target.checked)}
                                    />
                                    <div>
                                        <div style={{ fontWeight: "var(--fw-medium)", color: "var(--c-text)" }}>
                                            Connect to GitHub API for automated monitoring
                                        </div>
                                        <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: 2 }}>
                                            Requires GitHub integration in Settings
                                        </div>
                                    </div>
                                </label>
                                {form.connected && (
                                    <div style={{ padding: "var(--s-3)", background: "var(--c-info-bg)", borderRadius: "var(--r-md)", fontSize: "var(--fs-12)", color: "var(--c-info-text)" }}>
                                        <strong>If connected, TrustFabric can automatically:</strong>
                                        <ul style={{ marginTop: "var(--s-1)", paddingLeft: "var(--s-4)" }}>
                                            <li>Scan this system during compliance checks</li>
                                            <li>Detect configuration changes</li>
                                            <li>Monitor model usage</li>
                                        </ul>
                                    </div>
                                )}
                            </section>
                        </div>
                    </div>

                    <div className="register-form__actions">
                        <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
                        <button className="btn btn--secondary">Save as Draft</button>
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
                                {explaining ? "Asking Claude…" : "Explain what's missing"}
                            </button>
                        )}
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
                                    Claude&apos;s Explanation — {explanation.system_name}
                                </span>
                                <span style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginLeft: "auto" }}>
                                    {explanation.disclaimer}
                                </span>
                                <button
                                    type="button"
                                    style={{ background: "none", border: "none", cursor: "pointer", color: "var(--c-text-muted)", fontSize: 16 }}
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

/* ═══════════════════════════════════════════════════════════════════════════════
   SUB-COMPONENTS
   ═══════════════════════════════════════════════════════════════════════════════ */

function SystemGroup({
    label,
    systems,
    onViewDetails,
    onRunScan,
}: {
    label: string;
    systems: AISystemInventoryItem[];
    onViewDetails: (system: AISystemInventoryItem) => void;
    onRunScan: (system: AISystemInventoryItem) => void;
}) {
    const riskColor = label.includes("CRITICAL") ? "var(--c-critical)" : label.includes("HIGH") ? "var(--c-high)" : "var(--c-live)";

    return (
        <div>
        <div style={{
                padding: "var(--s-2) var(--s-4)",
                background: "var(--c-surface-raised)",
                borderBottom: "1px solid var(--c-border)",
                display: "flex",
                alignItems: "center",
                gap: "var(--s-2)",
            }}>
                <span style={{ width: 8, height: 8, borderRadius: "50%", background: riskColor }} />
                <span style={{ fontSize: "var(--fs-11)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
                    {label}
                </span>
            </div>
            {systems.map((system) => (
                <SystemCard
                    key={system.id}
                    system={system}
                    onViewDetails={() => onViewDetails(system)}
                    onRunScan={() => onRunScan(system)}
                />
            ))}
        </div>
    );
}

function SystemCard({
    system,
    onViewDetails,
    onRunScan,
}: {
    system: AISystemInventoryItem;
    onViewDetails: () => void;
    onRunScan: () => void;
}) {
    const TypeIcon = SYSTEM_TYPE_ICONS[system.type];

    return (
        <div className="system-card" onClick={onViewDetails}>
            <div className="system-card__icon">
                <TypeIcon sx={{ fontSize: 20 }} />
            </div>
            <div className="system-card__content">
                <div className="system-card__name">{system.name}</div>
                <div className="system-card__meta">
                    <span>Type: {SYSTEM_TYPE_LABELS[system.type]}</span>
                    <span>|</span>
                    <span>Owner: {system.owner}</span>
                </div>
                <div className="system-card__details">
                    <span>Data: {system.data_access_types.map(t => DATA_ACCESS_LABELS[t].split(" ")[0]).join(", ") || "Not specified"}</span>
                    <span>|</span>
                    <span>Models: {system.models_used.join(", ")}</span>
                    <span>|</span>
                    <span>Platform: {system.platform}</span>
                </div>
                <div className="system-card__status">
                    <span style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                        Last Scan: {system.last_scan_date ? formatDate(system.last_scan_date) : "Never"}
                    </span>
                    <ScanStatusBadge status={system.scan_status} violations={system.active_violations} />
                </div>
            </div>
            <div className="system-card__actions">
                <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); onViewDetails(); }}>View Details</button>
                <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); onRunScan(); }}>Generate Recommendation</button>
                <button className="btn btn--ghost btn--sm" onClick={(e) => e.stopPropagation()}>Edit</button>
                <button className="btn btn--ghost btn--sm" onClick={(e) => e.stopPropagation()}>Archive</button>
            </div>
        </div>
    );
}

function RecommendationResult({ recommendation }: { recommendation: CopilotRecommendation }) {
    const parsed = parseRecommendation(recommendation.raw_response);

    if (!parsed) {
        return (
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
        );
    }

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
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

function RiskDistributionBar({
    critical,
    high,
    low,
    total,
}: {
    critical: number;
    high: number;
    low: number;
    total: number;
}) {
    return (
        <div>
            <div style={{ display: "flex", height: 24, borderRadius: "var(--r-md)", overflow: "hidden", marginBottom: "var(--s-3)" }}>
                {critical > 0 && (
                    <div style={{ width: `${(critical / total) * 100}%`, background: "var(--c-critical)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)", color: "white" }}>
                        {Math.round((critical / total) * 100)}%
                    </div>
                )}
                {high > 0 && (
                    <div style={{ width: `${(high / total) * 100}%`, background: "var(--c-high)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)", color: "white" }}>
                        {Math.round((high / total) * 100)}%
                    </div>
                )}
                {low > 0 && (
                    <div style={{ width: `${(low / total) * 100}%`, background: "var(--c-live)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)", color: "white" }}>
                        {Math.round((low / total) * 100)}%
                    </div>
                )}
            </div>
            <div style={{ display: "flex", gap: "var(--s-4)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--c-critical)" }} />
                    Critical ({critical})
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--c-high)" }} />
                    High ({high})
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 6, fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>
                    <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--c-live)" }} />
                    Low ({low})
                </div>
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

function DetailRow({ icon: Icon, label, value }: { icon: SvgIconComponent; label: string; value: string }) {
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

function mapBackendSystemToInventory(system: BackendAISystem): AISystemInventoryItem {
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
        connected: false,
        last_scan_id: system.last_scan_id ?? undefined,
        last_scan_date: system.last_scan_date ?? undefined,
        compliance_score: system.compliance_score ?? undefined,
        active_violations: violations,
        scan_status: hasRealScan
            ? (violations > 0 ? "violations" : "compliant")
            : (system.missing_required_controls ? "violations" : "not_scanned"),
        status: system.status === "Active" ? "active" : system.status === "Retired" ? "archived" : "draft",
        registered_by: "api",
        registered_at: system.created_at,
        updated_at: system.updated_at,
    };
}

function toBackendCreatePayload(data: Partial<AISystemInventoryItem>) {
    const riskLevel = calculateRiskLevel(data.data_sensitivity ?? "Low", data.data_access_types ?? []);
    return {
        name: data.name ?? "",
        description: data.description ?? "",
        owner: data.owner ?? "",
        business_unit: data.department ?? "General",
        model_type: "LLM" as const,
        data_sensitivity: data.data_sensitivity ?? "Low",
        external_integrations: data.external_integrations ?? [],
        status: "Draft" as const,
        risk_tier: riskLevelToBackendTier(riskLevel),
        risk_justification: "Registered from frontend systems page.",
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
