"use client";
import {
    SmartToyOutlinedIcon, AddOutlinedIcon, SearchOutlinedIcon, ArrowBackOutlinedIcon,
    CheckCircleOutlinedIcon, WarningAmberOutlinedIcon, RadioButtonUncheckedOutlinedIcon,
    EditOutlinedIcon, ArchiveOutlinedIcon, DocumentScannerOutlinedIcon, VisibilityOutlinedIcon,
    BusinessOutlinedIcon, PersonOutlinedIcon, EmailOutlinedIcon, CodeOutlinedIcon,
    ChatOutlinedIcon, BrushOutlinedIcon, BarChartOutlinedIcon, CreateOutlinedIcon,
    ExtensionOutlinedIcon, LinkOutlinedIcon, HistoryOutlinedIcon, AutoAwesomeOutlinedIcon, FileDownloadOutlinedIcon,
    FileUploadOutlinedIcon, FilterListOutlinedIcon, ExpandMoreOutlinedIcon, SwapVertOutlinedIcon, MoreHorizOutlinedIcon,
    DeleteOutlinedIcon, PolicyOutlinedIcon,
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
import { auditApi, copilotApi, integrationsApi, policiesApi, systemsApi, type ExplainMissingResponse } from "@/lib/api";
import type {
    AISystemCreate,
    AISystemInventoryItem,
    AISystemType,
    CopilotRecommendation,
    DataSensitivity,
    DataAccessType,
    ModelType,
    ParsedRecommendation,
    PolicyKey,
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

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN PAGE
   ═══════════════════════════════════════════════════════════════════════════════ */

type PageView = "list" | "register" | "edit" | "details";

const MODEL_TYPE_LABELS: Record<ModelType, string> = {
    LLM: "Large Language Model",
    ML: "Machine Learning",
    Agent: "Agent",
    Other: "Other",
};

const STATUS_LABELS: Record<SystemStatus, string> = {
    Draft: "Draft",
    Active: "Active",
    Retired: "Retired",
};

const RISK_TIER_LABELS: Record<RiskTier, string> = {
    "Tier 1": "Tier 1 – Low Risk",
    "Tier 2": "Tier 2 – Medium Risk",
    "Tier 3": "Tier 3 – High Risk",
};

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
    const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState<AISystemInventoryItem | null>(null);

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

    const createSystemMutation = useMutation({
        mutationFn: systemsApi.create,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["systems"] }),
    });
    const updateSystemMutation = useMutation({
        mutationFn: ({ id, data }: { id: number; data: Parameters<typeof systemsApi.update>[1] }) =>
            systemsApi.update(id, data),
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["systems"] }),
    });
    const deleteSystemMutation = useMutation({
        mutationFn: systemsApi.delete,
        onSuccess: () => queryClient.invalidateQueries({ queryKey: ["systems"] }),
    });
    const runScanMutation = useMutation({
        mutationFn: copilotApi.recommend,
    });

    useEffect(() => {
        setSystems(backendSystems.map(mapBackendSystemToInventory));
    }, [backendSystems]);

    useEffect(() => {
        if (selectedSystem && backendSystems.length > 0) {
            const fresh = backendSystems.find((s) => String(s.id) === selectedSystem.id);
            if (fresh) setSelectedSystem(mapBackendSystemToInventory(fresh));
        }
    }, [backendSystems, selectedSystem]);

    const handleRegister = useCallback(() => {
        setView("register");
    }, []);

    const handleViewDetails = useCallback((system: AISystemInventoryItem) => {
        setSelectedSystem(system);
        setView("details");
    }, []);

    const handleEdit = useCallback((system: AISystemInventoryItem) => {
        setSelectedSystem(system);
        setView("edit");
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

    const handleUpdateSystem = useCallback(async (data: Partial<AISystemInventoryItem>) => {
        if (!selectedSystem) return;
        const payload = toBackendUpdatePayload(data);
        await updateSystemMutation.mutateAsync({ id: Number(selectedSystem.id), data: payload });
        setView("details");
    }, [selectedSystem, updateSystemMutation]);

    const handleArchive = useCallback(async (system: AISystemInventoryItem) => {
        await updateSystemMutation.mutateAsync({ id: Number(system.id), data: { status: "Retired" } });
    }, [updateSystemMutation]);

    const handleDeleteConfirm = useCallback((system: AISystemInventoryItem) => {
        setDeleteTarget(system);
        setDeleteConfirmOpen(true);
    }, []);

    const handleDeleteExecute = useCallback(async () => {
        if (!deleteTarget) return;
        await deleteSystemMutation.mutateAsync(Number(deleteTarget.id));
        setDeleteConfirmOpen(false);
        setDeleteTarget(null);
        if (view === "details") {
            setView("list");
            setSelectedSystem(null);
        }
    }, [deleteTarget, deleteSystemMutation, view]);

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

    const handleApplyRecommendationToSystem = useCallback(async (fields: Partial<{ model_type: ModelType; data_sensitivity: DataSensitivity; risk_tier: RiskTier; risk_justification: string }>) => {
        if (!selectedSystem) return;
        await updateSystemMutation.mutateAsync({ id: Number(selectedSystem.id), data: fields });
        setRecommendationModalOpen(false);
        setScanResult(null);
    }, [selectedSystem, updateSystemMutation]);

    const { data: githubStatus } = useQuery({
        queryKey: ["github-status"],
        queryFn: integrationsApi.getGitHubStatus,
        retry: false,
    });

    const handleOpenComplianceScans = useCallback(() => {
        if (githubStatus && !githubStatus.connected) {
            const goSettings = window.confirm(
                "GitHub is not connected yet.\n\nConnect GitHub in Settings before running a compliance scan.\n\nOpen Settings now?",
            );
            if (goSettings) router.push("/settings#integration-github");
            return;
        }
        router.push("/scans?app=github&start=config");
    }, [githubStatus, router]);

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
        view === "list" ? "AI Systems" : view === "register" ? "Register AI System" : view === "edit" ? "Edit AI System" : "System Details";

    const topBarSubtitle =
        view === "list"
            ? `${systems.length} system${systems.length !== 1 ? "s" : ""}`
            : (view === "details" || view === "edit") && selectedSystem
                ? selectedSystem.name
                : undefined;

    return (
        <>
            <TopBar
                title={topBarTitle}
                subtitle={topBarSubtitle}
                actions={
                    view === "list" ? (
                        <button type="button" className="btn btn--primary" onClick={handleRegister}>
                            <AddOutlinedIcon sx={{ fontSize: 16 }} /> Add AI System
                        </button>
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
                    />
                )}

                {view === "edit" && selectedSystem && (
                    <EditView
                        system={selectedSystem}
                        onCancel={() => { setView("details"); }}
                        onSave={handleUpdateSystem}
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
                        onEdit={() => handleEdit(selectedSystem)}
                        onArchive={() => handleArchive(selectedSystem)}
                        onDelete={() => handleDeleteConfirm(selectedSystem)}
                    />
                )}
            </main>

            {/* Recommendation Modal */}
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
                    <RecommendationResult
                        recommendation={scanResult}
                        onApply={selectedSystem ? handleApplyRecommendationToSystem : undefined}
                    />
                )}
            </Modal>

            {/* Delete Confirmation Modal */}
            <Modal
                open={deleteConfirmOpen}
                onClose={() => { setDeleteConfirmOpen(false); setDeleteTarget(null); }}
                title="Delete AI System"
                subtitle="This action cannot be undone"
                footer={
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-2)", width: "100%" }}>
                        <button className="btn btn--secondary btn--sm" onClick={() => { setDeleteConfirmOpen(false); setDeleteTarget(null); }}>
                            Cancel
                        </button>
                        <button
                            className="btn btn--sm"
                            style={{ background: "var(--c-critical)", color: "#fff" }}
                            onClick={() => void handleDeleteExecute()}
                            disabled={deleteSystemMutation.isPending}
                        >
                            {deleteSystemMutation.isPending ? "Deleting…" : "Delete System"}
                        </button>
                    </div>
                }
            >
                <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                    Are you sure you want to permanently delete <strong>{deleteTarget?.name}</strong>? All associated data, audit history, and compliance records will be removed.
                </p>
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
    status: SystemStatus;
    risk_tier: RiskTier | "";
    risk_justification: string;
    model_type: ModelType;
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
    status: "Draft",
    risk_tier: "",
    risk_justification: "",
    model_type: "LLM",
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

    const tierSet = form.risk_tier !== "";
    const justificationMissing = tierSet && form.risk_justification.trim().length === 0;
    const valid = form.name.trim().length > 0 && form.owner.trim().length > 0 && !justificationMissing;

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
            risk_tier: form.risk_tier || null,
            risk_justification: form.risk_justification || null,
            model_type: form.model_type,
            status: form.status === "Active" ? "active" : form.status === "Retired" ? "archived" : "draft",
        });
    };

    const applyRecommendation = (fields: Partial<{ model_type: ModelType; data_sensitivity: DataSensitivity; risk_tier: RiskTier; risk_justification: string }>) => {
        setForm((f) => ({
            ...f,
            ...(fields.model_type ? { model_type: fields.model_type } : {}),
            ...(fields.data_sensitivity ? { data_sensitivity: fields.data_sensitivity } : {}),
            ...(fields.risk_tier ? { risk_tier: fields.risk_tier } : {}),
            ...(fields.risk_justification ? { risk_justification: fields.risk_justification } : {}),
        }));
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
                    <SystemForm
                        form={form}
                        set={set}
                        toggleDataAccess={toggleDataAccess}
                        mode="create"
                    />

                    <FormCopilotPanel form={form} onApply={applyRecommendation} />

                    {justificationMissing && (
                        <p style={{ color: "var(--c-critical)", fontSize: "var(--fs-12)", margin: "var(--s-2) 0 0" }}>
                            Risk justification is required when a risk tier is selected.
                        </p>
                    )}

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
   EDIT VIEW
   ═══════════════════════════════════════════════════════════════════════════════ */

function EditView({
    system,
    onCancel,
    onSave,
}: {
    system: AISystemInventoryItem;
    onCancel: () => void;
    onSave: (data: Partial<AISystemInventoryItem>) => void;
}) {
    const initialForm: FormState = {
        name: system.name,
        type: system.type,
        description: system.description,
        owner: system.owner,
        contact_email: system.contact_email,
        department: system.department,
        data_sensitivity: system.data_sensitivity,
        data_access_types: system.data_access_types,
        platform: system.platform,
        models_used: system.models_used.join(", "),
        external_integrations: system.external_integrations.join(", "),
        connected: system.connected,
        status: system.status === "active" ? "Active" : system.status === "archived" ? "Retired" : "Draft",
        risk_tier: system.risk_tier ?? "",
        risk_justification: system.risk_justification ?? "",
        model_type: system.model_type,
    };

    const [form, setForm] = useState<FormState>(initialForm);

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

    const tierSet = form.risk_tier !== "";
    const justificationMissing = tierSet && form.risk_justification.trim().length === 0;
    const valid = form.name.trim().length > 0 && form.owner.trim().length > 0 && !justificationMissing;

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
            risk_tier: form.risk_tier || null,
            risk_justification: form.risk_justification || null,
            model_type: form.model_type,
            status: form.status === "Active" ? "active" : form.status === "Retired" ? "archived" : "draft",
        });
    };

    const applyRecommendation = (fields: Partial<{ model_type: ModelType; data_sensitivity: DataSensitivity; risk_tier: RiskTier; risk_justification: string }>) => {
        setForm((f) => ({
            ...f,
            ...(fields.model_type ? { model_type: fields.model_type } : {}),
            ...(fields.data_sensitivity ? { data_sensitivity: fields.data_sensitivity } : {}),
            ...(fields.risk_tier ? { risk_tier: fields.risk_tier } : {}),
            ...(fields.risk_justification ? { risk_justification: fields.risk_justification } : {}),
        }));
    };

    return (
        <div className="register-view">
            <button className="btn btn--ghost btn--sm" style={{ marginBottom: "var(--s-4)", gap: 4 }} onClick={onCancel}>
                <ArrowBackOutlinedIcon sx={{ fontSize: 14 }} /> Back to Details
            </button>

            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Edit AI System</span>
                </div>
                <div className="panel__body register-form">
                    <SystemForm
                        form={form}
                        set={set}
                        toggleDataAccess={toggleDataAccess}
                        mode="edit"
                    />

                    <FormCopilotPanel form={form} onApply={applyRecommendation} />

                    {justificationMissing && (
                        <p style={{ color: "var(--c-critical)", fontSize: "var(--fs-12)", margin: "var(--s-2) 0 0" }}>
                            Risk justification is required when a risk tier is selected.
                        </p>
                    )}

                    <div className="register-form__actions">
                        <button className="btn btn--secondary" onClick={onCancel}>Cancel</button>
                        <button className="btn btn--primary" disabled={!valid} onClick={handleSave}>
                            Save Changes
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   SHARED SYSTEM FORM (used by Register + Edit)
   ═══════════════════════════════════════════════════════════════════════════════ */

function SystemForm({
    form,
    set,
    toggleDataAccess,
    mode,
}: {
    form: FormState;
    set: <K extends keyof FormState>(key: K, value: FormState[K]) => void;
    toggleDataAccess: (type: DataAccessType) => void;
    mode: "create" | "edit";
}) {
    return (
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
                    <div className="register-form__row">
                        <div className="form-group">
                            <label className="form-label">Model Type *</label>
                            <select className="input" value={form.model_type} onChange={(e) => set("model_type", e.target.value as ModelType)}>
                                {Object.entries(MODEL_TYPE_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Status</label>
                            <select className="input" value={form.status} onChange={(e) => set("status", e.target.value as SystemStatus)}>
                                {Object.entries(STATUS_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
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
                    <div className="register-form__row">
                        <div className="form-group">
                            <label className="form-label">Risk Tier{mode === "edit" ? "" : " (optional)"}</label>
                            <select
                                className="input"
                                value={form.risk_tier}
                                onChange={(e) => set("risk_tier", e.target.value as RiskTier | "")}
                            >
                                <option value="">Not set</option>
                                {Object.entries(RISK_TIER_LABELS).map(([key, label]) => (
                                    <option key={key} value={key}>{label}</option>
                                ))}
                            </select>
                        </div>
                    </div>
                    {form.risk_tier && (
                        <div className="form-group">
                            <label className="form-label">Risk Justification *</label>
                            <textarea
                                className="input"
                                rows={3}
                                placeholder="Explain why this risk tier was assigned..."
                                value={form.risk_justification}
                                onChange={(e) => set("risk_justification", e.target.value)}
                            />
                        </div>
                    )}
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
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   FORM COPILOT PANEL (used on create/edit forms)
   ═══════════════════════════════════════════════════════════════════════════════ */

function FormCopilotPanel({
    form,
    onApply,
}: {
    form: FormState;
    onApply: (fields: Partial<{ model_type: ModelType; data_sensitivity: DataSensitivity; risk_tier: RiskTier; risk_justification: string }>) => void;
}) {
    const [loading, setLoading] = useState(false);
    const [result, setResult] = useState<CopilotRecommendation | null>(null);
    const [error, setError] = useState("");
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const handleGenerate = async () => {
        setLoading(true);
        setError("");
        setResult(null);
        setSelected(new Set());
        try {
            const payload: AISystemCreate = {
                name: form.name || "Untitled System",
                description: form.description,
                owner: form.owner,
                business_unit: form.department,
                model_type: form.model_type,
                data_sensitivity: form.data_sensitivity,
                external_integrations: form.external_integrations.split(",").map((s) => s.trim()).filter(Boolean),
                status: form.status || "Draft",
                risk_tier: form.risk_tier || null,
            };
            const rec = await copilotApi.recommendDraft(payload);
            setResult(rec);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Failed to generate recommendation");
        } finally {
            setLoading(false);
        }
    };

    const parsed = result ? parseRecommendation(result.raw_response) : null;

    const toggleSelection = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleApply = () => {
        if (!parsed) return;
        const fields: Partial<{ model_type: ModelType; data_sensitivity: DataSensitivity; risk_tier: RiskTier; risk_justification: string }> = {};
        if (selected.has("model_type")) fields.model_type = parsed.suggested_model_type;
        if (selected.has("data_sensitivity")) fields.data_sensitivity = parsed.suggested_data_sensitivity;
        if (selected.has("risk_tier")) {
            const tier = parsed.suggested_risk_tier as RiskTier;
            if (VALID_RISK_TIERS.has(tier)) {
                fields.risk_tier = tier;
                fields.risk_justification = parsed.rationale;
            }
        }
        onApply(fields);
        setResult(null);
        setSelected(new Set());
    };

    return (
        <div style={{ marginTop: "var(--s-4)", padding: "var(--s-4)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-raised)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "var(--s-3)" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                    <AIIcon size={16} />
                    <span style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-semibold)" }}>AI Copilot</span>
                </div>
                <button
                    className="btn btn--secondary btn--sm"
                    onClick={() => void handleGenerate()}
                    disabled={loading}
                >
                    <AutoAwesomeOutlinedIcon sx={{ fontSize: 14 }} />
                    {loading ? "Generating…" : "Generate Recommendations"}
                </button>
            </div>

            {error && (
                <div className="alert alert--danger" style={{ fontSize: "var(--fs-12)", marginBottom: "var(--s-3)" }}>
                    {error}
                </div>
            )}

            {parsed && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                        <label className="checkbox-label" style={{ fontSize: "var(--fs-12)" }}>
                            <input type="checkbox" checked={selected.has("model_type")} onChange={() => toggleSelection("model_type")} />
                            <span>Model Type: <strong>{parsed.suggested_model_type}</strong></span>
                        </label>
                        <label className="checkbox-label" style={{ fontSize: "var(--fs-12)" }}>
                            <input type="checkbox" checked={selected.has("data_sensitivity")} onChange={() => toggleSelection("data_sensitivity")} />
                            <span>Data Sensitivity: <strong>{parsed.suggested_data_sensitivity}</strong></span>
                        </label>
                        <label className="checkbox-label" style={{ fontSize: "var(--fs-12)" }}>
                            <input type="checkbox" checked={selected.has("risk_tier")} onChange={() => toggleSelection("risk_tier")} />
                            <span>Risk Tier: <strong>{parsed.suggested_risk_tier}</strong> (rationale applied as justification)</span>
                        </label>
                        <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", paddingLeft: "var(--s-4)" }}>
                            Policies: {parsed.suggested_policies.join(", ") || "None"} (advisory only)
                        </div>
                    </div>
                    {parsed.rationale && (
                        <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", padding: "var(--s-2)", background: "var(--c-surface)", borderRadius: "var(--r-sm)" }}>
                            <strong>Rationale:</strong> {parsed.rationale}
                        </div>
                    )}
                    {parsed.clarifying_questions.length > 0 && (
                        <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>
                            <strong>Clarifying Questions:</strong>
                            <ol style={{ margin: "var(--s-1) 0 0", paddingLeft: "1.25rem" }}>
                                {parsed.clarifying_questions.map((q, i) => <li key={i}>{q}</li>)}
                            </ol>
                        </div>
                    )}
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                        <button
                            className="btn btn--primary btn--sm"
                            disabled={selected.size === 0}
                            onClick={handleApply}
                        >
                            Apply Selected
                        </button>
                        <button className="btn btn--ghost btn--sm" onClick={() => setResult(null)}>
                            Dismiss
                        </button>
                    </div>
                    <CopilotAdvisoryNotice text={result?.disclaimer} style={{ margin: 0 }} />
                </div>
            )}

            {!parsed && !loading && !error && (
                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", margin: 0 }}>
                    Generate AI-powered recommendations for risk tier, model type, and data sensitivity based on the current form data.
                </p>
            )}
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
    onEdit,
    onArchive,
    onDelete,
}: {
    system: AISystemInventoryItem;
    auditLog: SystemAuditEntry[];
    onGenerateRecommendation: () => void;
    onRunComplianceScan: () => void;
    onViewScanHistory: () => void;
    onBack: () => void;
    onEdit: () => void;
    onArchive: () => void;
    onDelete: () => void;
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
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                            {system.risk_tier && <RiskTierBadge tier={system.risk_tier} />}
                            <RiskBadge level={system.risk_level} />
                        </div>
                    </div>
                    {system.risk_justification && (
                        <div style={{ marginTop: "var(--s-3)", padding: "var(--s-3)", background: "var(--c-surface-raised)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)" }}>
                            <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--s-1)" }}>
                                Risk Justification
                            </div>
                            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", margin: 0, lineHeight: 1.5 }}>
                                {system.risk_justification}
                            </p>
                        </div>
                    )}
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
                            <DetailRow icon={CheckCircleOutlinedIcon} label="Status" value={system.status === "active" ? "Active" : system.status === "archived" ? "Retired" : "Draft"} />
                            <DetailRow icon={BusinessOutlinedIcon} label="Owner" value={system.owner} />
                            <DetailRow icon={EmailOutlinedIcon} label="Contact" value={system.contact_email} />
                            <DetailRow icon={PersonOutlinedIcon} label="Department" value={system.department} />
                            <DetailRow icon={CodeOutlinedIcon} label="Model Type" value={MODEL_TYPE_LABELS[system.model_type]} />
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
                        {system.risk_tier && (
                            <div style={{ marginBottom: "var(--s-3)" }}>
                                <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: 4 }}>Risk Tier</div>
                                <RiskTierBadge tier={system.risk_tier} />
                            </div>
                        )}
                        <div style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                            <strong style={{ color: "var(--c-text)" }}>Risk Factors:</strong>
                            <ul style={{ marginTop: "var(--s-2)", paddingLeft: "var(--s-4)" }}>
                                <li>Data Sensitivity: {system.data_sensitivity}</li>
                                <li>External Integrations: {system.external_integrations.join(", ") || "None"}</li>
                                <li>Models Used: {system.models_used.join(", ")}</li>
                            </ul>
                        </div>
                        {system.missing_required_controls && (
                            <div style={{ marginTop: "var(--s-3)", padding: "var(--s-2) var(--s-3)", background: "var(--c-critical-bg, rgba(239,68,68,0.08))", borderRadius: "var(--r-sm)", border: "1px solid rgba(239,68,68,0.2)" }}>
                                <span style={{ fontSize: "var(--fs-12)", color: "var(--c-critical)", fontWeight: "var(--fw-semibold)" }}>
                                    <WarningAmberOutlinedIcon sx={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} />
                                    Missing Required Controls
                                </span>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Policy Mapping Panel */}
            <PolicyMappingPanel system={system} />

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
                <button className="btn btn--secondary" onClick={onEdit}>
                    <EditOutlinedIcon sx={{ fontSize: 16 }} /> Edit System
                </button>
                <button className="btn btn--secondary" onClick={onArchive}>
                    <ArchiveOutlinedIcon sx={{ fontSize: 16 }} /> Archive
                </button>
                <button
                    className="btn btn--secondary"
                    style={{ color: "var(--c-critical)" }}
                    onClick={onDelete}
                >
                    <DeleteOutlinedIcon sx={{ fontSize: 16 }} /> Delete
                </button>
                <button className="btn btn--primary" onClick={onGenerateRecommendation}>
                    <AIIcon size={16} /> Generate Recommendation
                </button>
            </div>
        </div>
    );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   POLICY MAPPING PANEL (§3.3)
   ═══════════════════════════════════════════════════════════════════════════════ */

function PolicyMappingPanel({ system }: { system: AISystemInventoryItem }) {
    const { data: catalog } = useQuery({
        queryKey: ["policy-catalog"],
        queryFn: policiesApi.catalog,
    });

    if (!catalog) return null;

    const systemTier = system.risk_tier;
    const requiredForTier = systemTier ? (catalog.by_risk_tier[systemTier] ?? []) : [];

    const hasOwner = !!system.owner;
    const hasDescription = system.description.length > 0;
    const hasJustification = (system.risk_justification?.length ?? 0) > 10;
    const hasPiiField = system.data_access_types?.includes("pii") || system.data_sensitivity === "High";
    const completenessChecks = [
        { label: "Owner defined", met: hasOwner },
        { label: "Description provided", met: hasDescription },
        { label: "Risk justification", met: hasJustification },
        { label: "PII / data sensitivity set", met: hasPiiField },
    ];
    const completeness = completenessChecks.filter((c) => c.met).length;

    return (
        <div className="panel">
            <div className="panel__header">
                <span className="panel__title" style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                    <PolicyOutlinedIcon sx={{ fontSize: 16 }} /> Policy Mapping
                </span>
                {systemTier && (
                    <span style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                        {requiredForTier.length} policies required for {systemTier}
                    </span>
                )}
            </div>
            <div className="panel__body">
                {system.missing_required_controls && (
                    <div style={{ marginBottom: "var(--s-4)", padding: "var(--s-3)", background: "var(--c-critical-bg, rgba(239,68,68,0.08))", borderRadius: "var(--r-md)", border: "1px solid rgba(239,68,68,0.2)" }}>
                        <span style={{ fontSize: "var(--fs-13)", color: "var(--c-critical)", fontWeight: "var(--fw-semibold)" }}>
                            <WarningAmberOutlinedIcon sx={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} />
                            Missing Required Controls — this system does not meet all mandatory policies for its risk tier.
                        </span>
                    </div>
                )}

                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
                    <div>
                        <h4 style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)" }}>
                            Policy Catalog
                        </h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                            {catalog.policies.map((policy) => {
                                const isRequired = requiredForTier.includes(policy.key);
                                return (
                                    <div
                                        key={policy.key}
                                        style={{
                                            padding: "var(--s-2) var(--s-3)",
                                            borderRadius: "var(--r-sm)",
                                            border: `1px solid ${isRequired ? "var(--c-accent, #3b82f6)" : "var(--c-border)"}`,
                                            background: isRequired ? "rgba(59,130,246,0.04)" : "transparent",
                                        }}
                                    >
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                                            <span style={{ fontSize: "var(--fs-13)", fontWeight: isRequired ? "var(--fw-semibold)" : "var(--fw-normal)", color: "var(--c-text)" }}>
                                                {policy.key.replace(/_/g, " ")}
                                                {isRequired && <span style={{ marginLeft: 6, fontSize: "var(--fs-10)", color: "var(--c-accent, #3b82f6)", textTransform: "uppercase" }}>Required</span>}
                                            </span>
                                        </div>
                                        <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: 2 }}>
                                            {policy.description}
                                        </div>
                                        <div style={{ fontSize: "var(--fs-10)", color: "var(--c-text-muted)", marginTop: 2 }}>
                                            Applies to: {policy.risk_tiers.join(", ")}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>

                    <div>
                        <h4 style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)" }}>
                            Completeness ({completeness}/{completenessChecks.length})
                        </h4>
                        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                            {completenessChecks.map((check) => (
                                <div key={check.label} style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", fontSize: "var(--fs-13)" }}>
                                    {check.met
                                        ? <CheckCircleOutlinedIcon sx={{ fontSize: 16, color: "var(--c-live-text, #16a34a)" }} />
                                        : <RadioButtonUncheckedOutlinedIcon sx={{ fontSize: 16, color: "var(--c-text-muted)" }} />
                                    }
                                    <span style={{ color: check.met ? "var(--c-text)" : "var(--c-text-muted)" }}>{check.label}</span>
                                </div>
                            ))}
                        </div>

                        {system.required_policies.length > 0 && (
                            <div style={{ marginTop: "var(--s-4)" }}>
                                <h4 style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", marginBottom: "var(--s-2)" }}>
                                    Required Policies (backend)
                                </h4>
                                <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--s-1)" }}>
                                    {system.required_policies.map((p) => (
                                        <span key={p} className="badge badge--neutral">{p.replace(/_/g, " ")}</span>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

function RecommendationResult({ recommendation, onApply }: { recommendation: CopilotRecommendation; onApply?: (fields: Partial<{ model_type: ModelType; data_sensitivity: DataSensitivity; risk_tier: RiskTier; risk_justification: string }>) => void }) {
    const parsed = parseRecommendation(recommendation.raw_response);
    const [selected, setSelected] = useState<Set<string>>(new Set());

    const toggleSelection = (key: string) => {
        setSelected((prev) => {
            const next = new Set(prev);
            if (next.has(key)) next.delete(key);
            else next.add(key);
            return next;
        });
    };

    const handleApply = () => {
        if (!parsed || !onApply) return;
        const fields: Partial<{ model_type: ModelType; data_sensitivity: DataSensitivity; risk_tier: RiskTier; risk_justification: string }> = {};
        if (selected.has("model_type")) fields.model_type = parsed.suggested_model_type;
        if (selected.has("data_sensitivity")) fields.data_sensitivity = parsed.suggested_data_sensitivity;
        if (selected.has("risk_tier")) {
            const tier = parsed.suggested_risk_tier as RiskTier;
            if (VALID_RISK_TIERS.has(tier)) {
                fields.risk_tier = tier;
                fields.risk_justification = parsed.rationale;
            }
        }
        onApply(fields);
    };

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

            {onApply && (
                <div style={{ padding: "var(--s-3)", borderRadius: "var(--r-md)", border: "1px solid var(--c-border)", background: "var(--c-surface-raised)" }}>
                    <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.04em", marginBottom: "var(--s-2)" }}>
                        Apply Selected Suggestions
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)", marginBottom: "var(--s-3)" }}>
                        <label className="checkbox-label" style={{ fontSize: "var(--fs-12)" }}>
                            <input type="checkbox" checked={selected.has("model_type")} onChange={() => toggleSelection("model_type")} />
                            <span>Model Type: <strong>{parsed.suggested_model_type}</strong></span>
                        </label>
                        <label className="checkbox-label" style={{ fontSize: "var(--fs-12)" }}>
                            <input type="checkbox" checked={selected.has("data_sensitivity")} onChange={() => toggleSelection("data_sensitivity")} />
                            <span>Data Sensitivity: <strong>{parsed.suggested_data_sensitivity}</strong></span>
                        </label>
                        <label className="checkbox-label" style={{ fontSize: "var(--fs-12)" }}>
                            <input type="checkbox" checked={selected.has("risk_tier")} onChange={() => toggleSelection("risk_tier")} />
                            <span>Risk Tier: <strong>{parsed.suggested_risk_tier}</strong> (rationale as justification)</span>
                        </label>
                        <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", paddingLeft: "var(--s-4)" }}>
                            Policies are advisory only and not directly applied.
                        </div>
                    </div>
                    <button
                        className="btn btn--primary btn--sm"
                        disabled={selected.size === 0}
                        onClick={handleApply}
                    >
                        Apply Selected &amp; Update System
                    </button>
                </div>
            )}

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

function RiskTierBadge({ tier }: { tier: RiskTier }) {
    const config: Record<RiskTier, { color: string; bg: string }> = {
        "Tier 1": { color: "var(--c-live, #16a34a)", bg: "var(--c-live-bg, rgba(22,163,74,0.08))" },
        "Tier 2": { color: "var(--c-high, #f59e0b)", bg: "var(--c-high-bg, rgba(245,158,11,0.08))" },
        "Tier 3": { color: "var(--c-critical, #ef4444)", bg: "var(--c-critical-bg, rgba(239,68,68,0.08))" },
    };
    const c = config[tier];
    return (
        <span style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 4,
            padding: "3px 8px",
            background: c.bg,
            color: c.color,
            borderRadius: "var(--r-md)",
            fontSize: "var(--fs-11)",
            fontWeight: "var(--fw-semibold)",
        }}>
            {tier}
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
        const tier = (VALID_RISK_TIERS.has(rawRiskTier) ? rawRiskTier : null) as RiskTier | null;
        return [{
            name,
            description: (descIdx >= 0 ? cells[descIdx] : "").trim() || "",
            owner: (ownerIdx >= 0 ? cells[ownerIdx] : "").trim() || "",
            business_unit: (deptIdx >= 0 ? cells[deptIdx] : "").trim() || "General",
            data_sensitivity: (VALID_DATA_SENSITIVITIES.has(rawSensitivity) ? rawSensitivity : "Low") as DataSensitivity,
            model_type: (VALID_MODEL_TYPES.has(rawModelType) ? rawModelType : "LLM") as ModelType,
            risk_tier: tier,
            risk_justification: tier ? `Imported risk tier ${tier} from bulk CSV.` : null,
            status: (VALID_STATUSES.has(rawStatus) ? rawStatus : "Draft") as SystemStatus,
            external_integrations: [],
        }];
    });
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
        risk_tier: system.risk_tier,
        risk_justification: system.risk_justification,
        data_sensitivity: system.data_sensitivity,
        data_access_types: [],
        model_type: system.model_type,
        required_policies: system.required_policies,
        missing_required_controls: system.missing_required_controls,
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

function toBackendCreatePayload(data: Partial<AISystemInventoryItem>): AISystemCreate {
    const statusMap: Record<string, SystemStatus> = { active: "Active", archived: "Retired", draft: "Draft" };
    return {
        name: data.name ?? "",
        description: data.description ?? "",
        owner: data.owner ?? "",
        business_unit: data.department ?? "General",
        model_type: data.model_type ?? "LLM",
        data_sensitivity: data.data_sensitivity ?? "Low",
        external_integrations: data.external_integrations ?? [],
        status: (data.status ? statusMap[data.status] : "Draft") ?? "Draft",
        risk_tier: data.risk_tier ?? null,
        risk_justification: data.risk_justification ?? null,
    };
}

function toBackendUpdatePayload(data: Partial<AISystemInventoryItem>): Parameters<typeof systemsApi.update>[1] {
    const statusMap: Record<string, SystemStatus> = { active: "Active", archived: "Retired", draft: "Draft" };
    const result: Record<string, unknown> = {};
    if (data.name !== undefined) result.name = data.name;
    if (data.description !== undefined) result.description = data.description;
    if (data.owner !== undefined) result.owner = data.owner;
    if (data.department !== undefined) result.business_unit = data.department;
    if (data.model_type !== undefined) result.model_type = data.model_type;
    if (data.data_sensitivity !== undefined) result.data_sensitivity = data.data_sensitivity;
    if (data.external_integrations !== undefined) result.external_integrations = data.external_integrations;
    if (data.status !== undefined) result.status = statusMap[data.status] ?? "Draft";
    if (data.risk_tier !== undefined) result.risk_tier = data.risk_tier;
    if (data.risk_justification !== undefined) result.risk_justification = data.risk_justification;
    return result as Parameters<typeof systemsApi.update>[1];
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
