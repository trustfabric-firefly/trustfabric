"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import ListOutlinedIcon from "@mui/icons-material/ListOutlined";
import EditOutlinedIcon from "@mui/icons-material/EditOutlined";
import DashboardCustomizeOutlinedIcon from "@mui/icons-material/DashboardCustomizeOutlined";
import { AIIcon, AIIconWrapper } from "@/components/ui/AIIcon";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ModeEditOutlineOutlinedIcon from "@mui/icons-material/ModeEditOutlineOutlined";
import VisibilityOutlinedIcon from "@mui/icons-material/VisibilityOutlined";
import ToggleOnOutlinedIcon from "@mui/icons-material/ToggleOnOutlined";
import ToggleOffOutlinedIcon from "@mui/icons-material/ToggleOffOutlined";
import AddOutlinedIcon from "@mui/icons-material/AddOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ArrowForwardOutlinedIcon from "@mui/icons-material/ArrowForwardOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import BarChartOutlinedIcon from "@mui/icons-material/BarChartOutlined";
import GroupOutlinedIcon from "@mui/icons-material/GroupOutlined";
import AttachMoneyOutlinedIcon from "@mui/icons-material/AttachMoneyOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import GitHubIcon from "@mui/icons-material/GitHub";
import { TopBar } from "@/components/layout/TopBar";
import { policyApi, systemPoliciesApi, systemsApi, scanPoliciesApi } from "@/lib/api";
import type {
    AISystem,
    Policy,
    PolicySeverity,
    PolicyCategory,
    PolicyTemplate as TPolicyTemplate,
    PolicyCreate,
    PolicyStatus,
    ScanPolicy,
} from "@/types";


type Tab = "view_all" | "manual" | "template" | "ai_generate" | "github_checks";

const TABS: { id: Tab; label: string; icon: SvgIconComponent }[] = [
    { id: "view_all", label: "View All", icon: ListOutlinedIcon },
    { id: "manual", label: "Manual", icon: EditOutlinedIcon },
    { id: "template", label: "Template", icon: DashboardCustomizeOutlinedIcon },
    { id: "ai_generate", label: "AI Generate", icon: AIIconWrapper as any },
    { id: "github_checks", label: "GitHub Checks", icon: GitHubIcon },
];


const CATEGORY_LABELS: Record<PolicyCategory, string> = {
    model_restrictions: "Model Restrictions",
    feature_control: "Feature Control",
    security: "Security",
    quality_control: "Quality Control",
    data_privacy: "Data Privacy",
    access_control: "Access Control",
    cost_management: "Cost Management",
    compliance: "Compliance",
};

const CATEGORY_ICONS: Record<PolicyCategory, SvgIconComponent> = {
    model_restrictions: LockOutlinedIcon,
    feature_control: ToggleOnOutlinedIcon,
    security: SecurityOutlinedIcon,
    quality_control: CheckCircleOutlinedIcon,
    data_privacy: VisibilityOutlinedIcon,
    access_control: GroupOutlinedIcon,
    cost_management: AttachMoneyOutlinedIcon,
    compliance: BarChartOutlinedIcon,
};

const MOCK_TEMPLATES: TPolicyTemplate[] = [
    { id: "tpl_001", name: "Restrict AI Models", description: "Limit which AI models developers can use. Configure allowed and prohibited models.", category: "model_restrictions", severity: "high", used_by: 47, default_rules: { allowed_models: ["claude-3-5-sonnet", "gpt-3.5-turbo"], forbidden_models: ["gpt-4*"], enforcement: "strict" }, customizable_fields: ["allowed_models", "forbidden_models", "enforcement"] },
    { id: "tpl_002", name: "Disable AI CLI Features", description: "Prevent use of command-line AI tools across the organization.", category: "feature_control", severity: "medium", used_by: 23, default_rules: { disabled_features: ["cli_completion", "cli_chat", "cli_edit"], environments: ["production", "staging"] }, customizable_fields: ["disabled_features", "environments"] },
    { id: "tpl_003", name: "Require Secret Scanning", description: "Mandate GitHub secret scanning on all repositories to prevent credential leaks.", category: "security", severity: "medium", used_by: 156, default_rules: { scan_on_push: true, block_push_on_detection: true, notification_channels: ["slack", "email"] }, customizable_fields: ["block_push_on_detection", "notification_channels"] },
    { id: "tpl_004", name: "Mandate Code Review for AI Code", description: "AI-generated code must have mandatory human review before deployment.", category: "quality_control", severity: "high", used_by: 89, default_rules: { min_reviewers: 2, require_senior_reviewer: true, auto_label_ai_code: true }, customizable_fields: ["min_reviewers", "require_senior_reviewer"] },
    { id: "tpl_005", name: "PII Anonymization Policy", description: "Enforce data anonymization for all AI systems processing personally identifiable information.", category: "data_privacy", severity: "high", used_by: 64, default_rules: { anonymize_before_training: true, gdpr_compliance: true, data_retention_days: 90 }, customizable_fields: ["data_retention_days", "gdpr_compliance"] },
    { id: "tpl_006", name: "API Rate Limiting for AI", description: "Set usage quotas and rate limits for AI model API calls to control costs.", category: "cost_management", severity: "low", used_by: 31, default_rules: { max_requests_per_minute: 60, max_tokens_per_day: 1000000, alert_at_80_percent: true }, customizable_fields: ["max_requests_per_minute", "max_tokens_per_day"] },
];


export default function PoliciesPage() {
    const queryClient = useQueryClient();
    const [activeTab, setActiveTab] = useState<Tab>("view_all");
    const [contextSystemId, setContextSystemId] = useState<number | "">("");

    const { data: systems = [], isLoading: systemsLoading } = useQuery({
        queryKey: ["systems"],
        queryFn: systemsApi.list,
    });

    const { data: policies = [], isLoading: policiesLoading, isError: policiesError } = useQuery({
        queryKey: ["governance-policies"],
        queryFn: async () => {
            const list = await systemsApi.list();
            if (list.length === 0) return [];
            const chunks = await Promise.all(
                list.map(async (s) => {
                    const ps = await systemPoliciesApi.list(s.id);
                    return ps.map((p) => ({
                        ...p,
                        system_id: s.id,
                        system_name: s.name,
                    }));
                })
            );
            return chunks
                .flat()
                .sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
        },
    });

    useEffect(() => {
        if (systems.length === 0) return;
        setContextSystemId((prev) => (prev === "" ? systems[0].id : prev));
    }, [systems]);

    const handleCreate = useCallback(
        async (data: PolicyCreate, systemId: number, opts?: { asDraft?: boolean }) => {
            const status: PolicyStatus = opts?.asDraft ? "draft" : "active";
            await systemPoliciesApi.create(systemId, { ...data, status });
            await queryClient.invalidateQueries({ queryKey: ["governance-policies"] });
            setActiveTab("view_all");
        },
        [queryClient]
    );

    const handleToggle = useCallback(
        async (policy: Policy) => {
            if (policy.system_id == null) return;
            const next: PolicyStatus = policy.status === "active" ? "inactive" : "active";
            await systemPoliciesApi.update(policy.system_id, policy.id, { status: next });
            await queryClient.invalidateQueries({ queryKey: ["governance-policies"] });
        },
        [queryClient]
    );

    const { data: scanPolicies = [], refetch: refetchScanPolicies } = useQuery({
        queryKey: ["scan-policies"],
        queryFn: scanPoliciesApi.list,
        retry: false,
    });

    const handleToggleScanPolicy = useCallback(async (checkId: string, enabled: boolean) => {
        await scanPoliciesApi.toggle(checkId, enabled);
        await refetchScanPolicies();
    }, [refetchScanPolicies]);

    const loading = systemsLoading || policiesLoading;

    return (
        <>
            <TopBar
                title="Policy Management"
                subtitle={loading ? "Loading…" : `${policies.length} policies`}
                actions={
                    <button className="btn btn--primary" onClick={() => setActiveTab("manual")}>
                        <AddOutlinedIcon sx={{ fontSize: 16 }} /> Create Policy
                    </button>
                }
            />

            <main className={`page${activeTab === "ai_generate" ? " page--flex" : ""}`}>
                {/* Tab bar panel */}
                <div className={`panel${activeTab === "ai_generate" ? " panel--flex" : ""}`} style={{ marginBottom: activeTab === "ai_generate" ? 0 : "var(--s-4)" }}>
                    <div className="tabs">
                        {TABS.map(({ id, label, icon: Icon }) => (
                            <button
                                key={id}
                                className={`tabs__tab${activeTab === id ? " active" : ""}`}
                                onClick={() => setActiveTab(id)}
                            >
                                <Icon sx={{ fontSize: 16 }} /> {label}
                            </button>
                        ))}
                    </div>

                    {/* Tab Content */}
                    <div className="tab-content">
                        {activeTab === "view_all" && (
                            <ViewAllTab
                                policies={policies}
                                onToggle={handleToggle}
                                error={policiesError}
                            />
                        )}
                        {activeTab === "manual" && (
                            <ManualTab
                                systems={systems}
                                systemId={contextSystemId}
                                onSystemIdChange={setContextSystemId}
                                systemsLoading={systemsLoading}
                                onCreate={(data, opts) => {
                                    if (contextSystemId === "") return;
                                    return handleCreate(data, contextSystemId, opts);
                                }}
                            />
                        )}
                        {activeTab === "template" && (
                            <TemplateTab
                                systems={systems}
                                systemId={contextSystemId}
                                onSystemIdChange={setContextSystemId}
                                systemsLoading={systemsLoading}
                                onCreate={(data) => {
                                    if (contextSystemId === "") return;
                                    return handleCreate(data, contextSystemId);
                                }}
                            />
                        )}
                        {activeTab === "ai_generate" && (
                            <AIGenerateTab
                                onCreate={(data, systemId) => handleCreate(data, systemId)}
                            />
                        )}
                        {activeTab === "github_checks" && (
                            <GitHubChecksTab
                                policies={scanPolicies}
                                onToggle={handleToggleScanPolicy}
                            />
                        )}
                    </div>
                </div>
            </main>
        </>
    );
}


function ViewAllTab({
    policies,
    onToggle,
    error,
}: {
    policies: Policy[];
    onToggle: (policy: Policy) => void | Promise<void>;
    error?: boolean;
}) {
    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState<"all" | "active" | "inactive" | "draft">("all");

    if (error) {
        return (
            <div style={{ padding: "var(--s-4)", color: "var(--c-high)" }}>
                Could not load policies. Check the API and sign-in. Saving/toggling policies requires an admin token or Firebase user with role admin.
            </div>
        );
    }

    const filtered = policies
        .filter((p) => filter === "all" || p.status === filter)
        .filter((p) => !search || p.name.toLowerCase().includes(search.toLowerCase()) || p.description.toLowerCase().includes(search.toLowerCase()));

    return (
        <div style={{ padding: "var(--s-4)" }}>
            {/* Search + Filter bar */}
            <div style={{ display: "flex", gap: "var(--s-3)", marginBottom: "var(--s-4)", alignItems: "center" }}>
                <div className="search-bar" style={{ flex: 1 }}>
                    <span className="search-bar__icon"><SearchOutlinedIcon sx={{ fontSize: 16 }} /></span>
                    <input className="input" placeholder="Search policies..." value={search} onChange={(e) => setSearch(e.target.value)} />
                </div>
                <select className="input" style={{ width: 140 }} value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)}>
                    <option value="all">All Status</option>
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                    <option value="draft">Draft</option>
                </select>
            </div>

            {/* Policy list */}
            {filtered.length === 0 ? (
                <div className="empty-state" style={{ padding: "var(--s-8)" }}>
                    <div className="empty-state__icon"><DescriptionOutlinedIcon sx={{ fontSize: 20 }} /></div>
                    <p className="empty-state__title">No policies found</p>
                    <p className="empty-state__desc">{search ? "Try adjusting your search." : "Create your first policy to get started."}</p>
                </div>
            ) : (
                <div>
                    {filtered.map((p) => {
                        const CatIcon = CATEGORY_ICONS[p.category] ?? DescriptionOutlinedIcon;
                        return (
                            <div key={p.id} className="policy-item">
                                <div className="policy-item__icon">
                                    <CatIcon sx={{ fontSize: 18 }} />
                                </div>
                                <div className="policy-item__body">
                                    <div className="policy-item__name">{p.name}</div>
                                    {p.system_name ? (
                                        <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginBottom: "var(--s-1)" }}>
                                            System: {p.system_name}
                                        </div>
                                    ) : null}
                                    <div className="policy-item__desc">{p.description}</div>
                                    <div className="policy-item__meta">
                                        <span className={`badge badge--${p.status === "active" ? "live" : p.status === "draft" ? "neutral" : "warning"}`}>
                                            {p.status}
                                        </span>
                                        <span>{CATEGORY_LABELS[p.category]}</span>
                                        <span>Created {fmtDate(p.created_at)}</span>
                                        {p.updated_at !== p.created_at && <span>Updated {fmtDate(p.updated_at)}</span>}
                                        <span>v{p.version}</span>
                                        <span className="badge badge--neutral" style={{ fontSize: "var(--fs-11)" }}>{p.creation_method.replace("_", " ")}</span>
                                    </div>
                                </div>
                                <div className="policy-item__actions">
                                    <button className="btn btn--ghost btn--sm" title="Edit"><ModeEditOutlineOutlinedIcon sx={{ fontSize: 15 }} /></button>
                                    <button className="btn btn--ghost btn--sm" title="View details"><VisibilityOutlinedIcon sx={{ fontSize: 15 }} /></button>
                                    <button className="btn btn--ghost btn--sm" title={p.status === "active" ? "Disable" : "Enable"} onClick={() => onToggle(p)}>
                                        {p.status === "active" ? <ToggleOnOutlinedIcon sx={{ fontSize: 15 }} /> : <ToggleOffOutlinedIcon sx={{ fontSize: 15 }} />}
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                    <div style={{ padding: "var(--s-3) var(--s-4)", fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                        Showing {filtered.length} of {policies.length} policies
                    </div>
                </div>
            )}
        </div>
    );
}

const EMPTY_MANUAL: PolicyCreate = {
    name: "", description: "", category: "compliance", severity: "medium", applies_to: ["All Organizations"], creation_method: "manual",
};

function ManualTab({
    systems,
    systemId,
    onSystemIdChange,
    systemsLoading,
    onCreate,
}: {
    systems: AISystem[];
    systemId: number | "";
    onSystemIdChange: (id: number | "") => void;
    systemsLoading: boolean;
    onCreate: (data: PolicyCreate, opts?: { asDraft?: boolean }) => void | Promise<void>;
}) {
    const [form, setForm] = useState<PolicyCreate>(EMPTY_MANUAL);
    const set = (k: keyof PolicyCreate, v: unknown) => setForm((f) => ({ ...f, [k]: v }));
    const valid = form.name.trim().length > 0 && form.description.trim().length > 0;
    const canSave = valid && systemId !== "";

    return (
        <div style={{ padding: "var(--s-4)", maxWidth: 640 }}>
            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", marginBottom: "var(--s-5)", lineHeight: 1.5 }}>
                Write your policy in plain language. Policies are stored in Firestore under the selected AI system.
            </p>

            <div className="form-group">
                <label className="form-label">AI system *</label>
                <select
                    className="input"
                    value={systemId}
                    onChange={(e) => onSystemIdChange(e.target.value ? Number(e.target.value) : "")}
                    disabled={systemsLoading}
                >
                    <option value="">{systemsLoading ? "Loading systems…" : systems.length === 0 ? "No systems — create one in Inventory" : "Select system"}</option>
                    {systems.map((s) => (
                        <option key={s.id} value={s.id}>
                            {s.name} (Risk: {s.risk_tier ?? "Unassigned"})
                        </option>
                    ))}
                </select>
            </div>

            <div className="form-group">
                <label className="form-label">Policy Name *</label>
                <input className="input" placeholder='e.g., "Restrict AI Models to Approved List"' value={form.name} onChange={(e) => set("name", e.target.value)} />
            </div>

            <div className="form-group">
                <label className="form-label">Policy Description *</label>
                <textarea className="input" rows={5} placeholder="Describe the policy requirements in detail..." value={form.description} onChange={(e) => set("description", e.target.value)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)" }}>
                <div className="form-group">
                    <label className="form-label">Category</label>
                    <select className="input" value={form.category} onChange={(e) => set("category", e.target.value)}>
                        {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                </div>
                <div className="form-group">
                    <label className="form-label">Applies To</label>
                    <select className="input" value={form.applies_to[0]} onChange={(e) => set("applies_to", [e.target.value])}>
                        <option>All Organizations</option>
                        <option>Engineering</option>
                        <option>Data Science</option>
                        <option>Product</option>
                        <option>Security</option>
                    </select>
                </div>
            </div>

            <div className="form-group">
                <label className="form-label">Severity Level</label>
                <SeverityRadio value={form.severity} onChange={(v) => set("severity", v)} />
            </div>

            <div className="divider" />

            <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "flex-end" }}>
                <button className="btn btn--secondary" onClick={() => setForm(EMPTY_MANUAL)}>Cancel</button>
                <button className="btn btn--secondary" disabled={!canSave} onClick={() => canSave && onCreate(form, { asDraft: true })}>
                    Save as Draft
                </button>
                <button className="btn btn--primary" disabled={!canSave} onClick={() => canSave && onCreate(form)}>
                    Create Policy
                </button>
            </div>
        </div>
    );
}

function TemplateTab({
    systems,
    systemId,
    onSystemIdChange,
    systemsLoading,
    onCreate,
}: {
    systems: AISystem[];
    systemId: number | "";
    onSystemIdChange: (id: number | "") => void;
    systemsLoading: boolean;
    onCreate: (data: PolicyCreate) => void | Promise<void>;
}) {
    const [selected, setSelected] = useState<TPolicyTemplate | null>(null);
    const [search, setSearch] = useState("");
    const [form, setForm] = useState<PolicyCreate | null>(null);

    const handleSelect = (tpl: TPolicyTemplate) => {
        setSelected(tpl);
        setForm({
            name: tpl.name,
            description: tpl.description,
            category: tpl.category,
            severity: tpl.severity,
            applies_to: ["All Organizations"],
            creation_method: "template",
            rules: { ...tpl.default_rules },
        });
    };

    const filtered = MOCK_TEMPLATES.filter(
        (t) => !search || t.name.toLowerCase().includes(search.toLowerCase()) || t.description.toLowerCase().includes(search.toLowerCase())
    );

    if (selected && form) {
        const canCreate = systemId !== "";
        return (
            <div style={{ padding: "var(--s-4)", maxWidth: 640 }}>
                <button className="btn btn--ghost btn--sm" style={{ marginBottom: "var(--s-4)", gap: 4 }} onClick={() => { setSelected(null); setForm(null); }}>
                    <ArrowBackOutlinedIcon sx={{ fontSize: 14 }} /> Back to Templates
                </button>

                <h3 style={{ fontSize: "var(--fs-16)", fontWeight: "var(--fw-semibold)", marginBottom: "var(--s-1)" }}>
                    Customize Template: {selected.name}
                </h3>
                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-5)" }}>
                    Pre-filled from template. Modify fields as needed.
                </p>

                <div className="form-group">
                    <label className="form-label">AI system *</label>
                    <select
                        className="input"
                        value={systemId}
                        onChange={(e) => onSystemIdChange(e.target.value ? Number(e.target.value) : "")}
                        disabled={systemsLoading}
                    >
                        <option value="">{systemsLoading ? "Loading systems…" : systems.length === 0 ? "No systems" : "Select system"}</option>
                        {systems.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.name} (Risk: {s.risk_tier ?? "Unassigned"})
                            </option>
                        ))}
                    </select>
                </div>

                <div className="form-group">
                    <label className="form-label">Policy Name</label>
                    <input className="input" value={form.name} onChange={(e) => setForm((f) => f ? { ...f, name: e.target.value } : f)} />
                </div>
                <div className="form-group">
                    <label className="form-label">Policy Description</label>
                    <textarea className="input" rows={4} value={form.description} onChange={(e) => setForm((f) => f ? { ...f, description: e.target.value } : f)} />
                </div>

                <div className="form-group">
                    <label className="form-label">Severity</label>
                    <SeverityRadio value={form.severity} onChange={(v) => setForm((f) => f ? { ...f, severity: v } : f)} />
                </div>

                {/* Rules JSON preview */}
                <div className="form-group">
                    <label className="form-label">Enforcement Rules</label>
                    <div className="code-block">{JSON.stringify(form.rules, null, 2)}</div>
                </div>

                <div className="divider" />
                <div style={{ display: "flex", gap: "var(--s-2)", justifyContent: "flex-end" }}>
                    <button className="btn btn--secondary" onClick={() => { setSelected(null); setForm(null); }}>Cancel</button>
                    <button className="btn btn--primary" disabled={!canCreate} onClick={() => canCreate && onCreate(form)}>Create Policy</button>
                </div>
            </div>
        );
    }

    return (
        <div style={{ padding: "var(--s-4)" }}>
            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", marginBottom: "var(--s-4)", lineHeight: 1.5 }}>
                Select a pre-configured policy template and customize it for your organization. Saved policies are attached to an AI system in Firestore.
            </p>

            <div className="search-bar" style={{ marginBottom: "var(--s-4)" }}>
                <span className="search-bar__icon"><SearchOutlinedIcon sx={{ fontSize: 16 }} /></span>
                <input className="input" placeholder="Search templates..." value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))", gap: "var(--s-3)" }}>
                {filtered.map((tpl) => {
                    const CatIcon = CATEGORY_ICONS[tpl.category] ?? DescriptionOutlinedIcon;
                    return (
                        <div key={tpl.id} className="template-card" onClick={() => handleSelect(tpl)}>
                            <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-2)" }}>
                                <CatIcon sx={{ fontSize: 16 }} />
                                <span className="template-card__name">{tpl.name}</span>
                            </div>
                            <div className="template-card__desc">{tpl.description}</div>
                            <div className="template-card__footer">
                                <span>{CATEGORY_LABELS[tpl.category]}</span>
                                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                                    <span>Used by {tpl.used_by} orgs</span>
                                    <span className="btn btn--ghost btn--sm" style={{ gap: 4, padding: "2px 8px" }}>
                                        Select <ArrowForwardOutlinedIcon sx={{ fontSize: 12 }} />
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
            <div style={{ marginTop: "var(--s-3)", fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                Showing {filtered.length} templates
            </div>
        </div>
    );
}


type ChatMessage = {
    id: string;
    role: "user" | "ai";
    content: string;
    policy?: PolicyCreate;
    rules?: Record<string, unknown>;
};

const AI_SUGGESTIONS = [
    "Restrict developers from using GPT-4 models",
    "Require human review for all AI-generated code",
    "Enable secret scanning on all repositories",
    "Set API rate limits for AI model usage",
];

function AIGenerateTab({
    onCreate,
}: {
    onCreate: (data: PolicyCreate, systemId: number) => void | Promise<void>;
}) {
    const [messages, setMessages] = useState<ChatMessage[]>([]);
    const [input, setInput] = useState("");
    const [isTyping, setIsTyping] = useState(false);
    const [selectedSystemId, setSelectedSystemId] = useState<number | "">("");
    const messagesEndRef = useRef<HTMLDivElement>(null);
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const {
        data: systems = [],
        isLoading: isLoadingSystems,
        isError: isSystemsError,
        error: systemsError,
    } = useQuery({
        queryKey: ["systems"],
        queryFn: systemsApi.list,
        refetchOnMount: "always",
    });

    useEffect(() => {
        if (selectedSystemId === "" && systems.length > 0) {
            setSelectedSystemId(systems[0].id);
        }
    }, [selectedSystemId, systems]);

    const scrollToBottom = useCallback(() => {
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: "smooth" }), 50);
    }, []);

    const handleSend = useCallback(async (text?: string) => {
        const msg = (text ?? input).trim();
        if (!msg || isTyping) return;

        const userMsg: ChatMessage = { id: `msg_${Date.now()}`, role: "user", content: msg };
        setMessages((prev) => [...prev, userMsg]);
        setInput("");
        setIsTyping(true);
        scrollToBottom();

        // Auto-resize textarea back
        if (textareaRef.current) textareaRef.current.style.height = "24px";

        const hasPolicy = messages.some((m) => m.role === "ai" && m.policy);
        const isRefinement = isLikelyRefinement(msg);

        if (hasPolicy && isRefinement) {
            const aiResponse = generateAIResponse(msg, messages);
            setMessages((prev) => [...prev, aiResponse]);
            setIsTyping(false);
            scrollToBottom();
            return;
        }

        (async () => {
            try {
                const response = await policyApi.generate(
                    msg,
                    messages.slice(-6).map((m) => `${m.role}: ${m.content}`)
                );
                const aiResponse: ChatMessage = {
                    id: `msg_${Date.now()}`,
                    role: "ai",
                    content: response.content,
                    policy: response.policy,
                    rules: response.rules,
                };
                setMessages((prev) => [...prev, aiResponse]);
            } catch {
                const fallback = generateAIResponse(msg, messages);
                setMessages((prev) => [...prev, fallback]);
            } finally {
                setIsTyping(false);
                scrollToBottom();
            }
        })();
    }, [input, isTyping, messages, scrollToBottom]);

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    };

    const handleTextareaInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        setInput(e.target.value);
        // Auto-grow
        const el = e.target;
        el.style.height = "24px";
        el.style.height = Math.min(el.scrollHeight, 120) + "px";
    };

    const handleSavePolicy = (msg: ChatMessage) => {
        if (msg.policy && selectedSystemId !== "") {
            onCreate({ ...msg.policy, rules: msg.rules }, selectedSystemId as number);
        }
    };

    return (
        <div className="chat">
            {/* Message area */}
            <div className="chat__messages">
                {messages.length === 0 ? (
                    <div className="chat__empty">
                        <div className="chat__empty-icon">
                            <AIIcon size={28} />
                        </div>
                        <div className="chat__empty-title">AI Policy Generator</div>
                        <div className="chat__empty-desc">
                            Describe the policy you need in plain language. I will generate a structured, enforceable policy for your organization. You can keep refining it through conversation.
                        </div>
                        <div className="chat__suggestions">
                            {AI_SUGGESTIONS.map((s, i) => (
                                <button key={i} className="chat__suggestion" onClick={() => handleSend(s)}>
                                    <BoltOutlinedIcon sx={{ fontSize: 16 }} /> {s}
                                </button>
                            ))}
                        </div>
                    </div>
                ) : (
                    <>
                        {messages.map((msg) => (
                            <div key={msg.id} className={`chat__msg chat__msg--${msg.role}`}>
                                {msg.role === "ai" && (
                                    <div className="chat__avatar chat__avatar--ai">
                                        <AIIcon size={16} />
                                    </div>
                                )}
                                <div className={`chat__bubble chat__bubble--${msg.role}`}>
                                    {msg.role === "user" ? (
                                        msg.content
                                    ) : (
                                        <>
                                            {renderAIContent(msg.content)}
                                            {msg.policy && (
                                                <div className="chat__policy-card">
                                                    <div className="chat__policy-card__header">
                                                        <div className="chat__policy-card__title">
                                                            <DescriptionOutlinedIcon sx={{ fontSize: 16 }} />
                                                            {msg.policy.name}
                                                        </div>
                                                        <span className={`badge badge--${msg.policy.severity === "high" ? "danger" : msg.policy.severity === "medium" ? "warning" : "neutral"}`}>
                                                            {msg.policy.severity}
                                                        </span>
                                                    </div>
                                                    <div className="chat__policy-card__body">{msg.policy.description}</div>
                                                    {msg.rules && (
                                                        <div className="chat__policy-card__rules">
                                                            <div className="code-block">{JSON.stringify(msg.rules, null, 2)}</div>
                                                        </div>
                                                    )}
                                                    <div className="chat__policy-card__actions">
                                                        <button
                                                            type="button"
                                                            className="btn btn--primary btn--sm"
                                                            disabled={selectedSystemId === ""}
                                                            title={selectedSystemId === "" ? "Select an AI system below before saving" : undefined}
                                                            onClick={() => handleSavePolicy(msg)}
                                                        >
                                                            <CheckCircleOutlinedIcon sx={{ fontSize: 14 }} /> Save Policy
                                                        </button>
                                                        <button className="btn btn--secondary btn--sm" onClick={() => {
                                                            setInput(`Refine this policy: make the ${msg.policy!.name} more strict`);
                                                            textareaRef.current?.focus();
                                                        }}>
                                                            <RefreshOutlinedIcon sx={{ fontSize: 14 }} /> Refine
                                                        </button>
                                                        <button className="btn btn--ghost btn--sm" onClick={() => {
                                                            navigator.clipboard.writeText(JSON.stringify({ ...msg.policy, rules: msg.rules }, null, 2));
                                                        }}>
                                                            <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} /> Copy JSON
                                                        </button>
                                                    </div>
                                                </div>
                                            )}
                                        </>
                                    )}
                                </div>
                                {msg.role === "user" && (
                                    <div className="chat__avatar chat__avatar--user">U</div>
                                )}
                            </div>
                        ))}

                        {/* Typing indicator */}
                        {isTyping && (
                            <div className="chat__msg chat__msg--ai">
                                <div className="chat__avatar chat__avatar--ai">
                                    <AIIcon size={16} />
                                </div>
                                <div className="chat__typing">
                                    <div className="chat__typing-dot" />
                                    <div className="chat__typing-dot" />
                                    <div className="chat__typing-dot" />
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </>
                )}
            </div>

            {/* Input bar — always at bottom */}
            <div className="chat__input-bar">
                <div style={{ maxWidth: 760, margin: "0 auto 8px", display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
                    <label style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>System</label>
                    <select
                        className="input"
                        style={{ width: "100%" }}
                        value={selectedSystemId}
                        onChange={(e) => setSelectedSystemId(e.target.value ? Number(e.target.value) : "")}
                        disabled={isLoadingSystems || isTyping}
                    >
                        <option value="">
                            {isLoadingSystems ? "Loading systems..." : systems.length === 0 ? "No systems available" : "Select system"}
                        </option>
                        {systems.map((system) => (
                            <option key={system.id} value={system.id}>
                                {system.name} (Risk: {system.risk_tier ?? "Unassigned"})
                            </option>
                        ))}
                    </select>
                </div>
                {systems.length === 0 && !isLoadingSystems && (
                    <div style={{ maxWidth: 760, margin: "0 auto 8px", fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textAlign: "center" }}>
                        No systems found. Create one via `POST /api/v1/systems` and refresh this page.
                    </div>
                )}
                {isSystemsError && (
                    <div style={{ maxWidth: 760, margin: "0 auto 8px", fontSize: "var(--fs-11)", color: "var(--c-high)", textAlign: "center" }}>
                        Failed to load systems: {systemsError instanceof Error ? systemsError.message : "Unknown error"}
                    </div>
                )}
                <div className="chat__input-wrap">
                    <textarea
                        ref={textareaRef}
                        className="chat__textarea"
                        placeholder="Describe a policy or ask to refine..."
                        value={input}
                        onChange={handleTextareaInput}
                        onKeyDown={handleKeyDown}
                        rows={1}
                    />
                    <button
                        className="chat__send-btn"
                        disabled={!input.trim() || isTyping}
                        onClick={() => handleSend()}
                    >
                        <SendOutlinedIcon sx={{ fontSize: 16 }} />
                    </button>
                </div>
                <div style={{ maxWidth: 760, margin: "6px auto 0", fontSize: "var(--fs-11)", color: "var(--c-text-muted)", textAlign: "center" }}>
                    AI can make mistakes. Review generated policies before enforcing.
                </div>
            </div>
        </div>
    );
}

/*   Render AI text content with basic formatting   */
function renderAIContent(text: string): React.ReactNode {
    return text.split("\n\n").map((para, i) => {
        if (para.startsWith("- ") || para.startsWith("• ")) {
            const items = para.split("\n").filter(Boolean);
            return (
                <ul key={i}>
                    {items.map((item, j) => (
                        <li key={j}>{item.replace(/^[-•]\s*/, "")}</li>
                    ))}
                </ul>
            );
        }
        // Bold text between **...**
        const parts = para.split(/(\*\*[^*]+\*\*)/g);
        return (
            <p key={i}>
                {parts.map((part, j) =>
                    part.startsWith("**") && part.endsWith("**")
                        ? <strong key={j}>{part.slice(2, -2)}</strong>
                        : part
                )}
            </p>
        );
    });
}


function SeverityRadio({ value, onChange }: { value: PolicySeverity; onChange: (v: PolicySeverity) => void }) {
    const options: { value: PolicySeverity; label: string }[] = [
        { value: "low", label: "Low" },
        { value: "medium", label: "Medium" },
        { value: "high", label: "High" },
    ];

    return (
        <div className="severity-radio">
            {options.map((opt) => (
                <button
                    key={opt.value}
                    type="button"
                    className={`severity-radio__option${value === opt.value ? " active" : ""}`}
                    onClick={() => onChange(opt.value)}
                >
                    <span className="severity-radio__dot" />
                    {opt.label}
                </button>
            ))}
        </div>
    );
}

function fmtDate(iso: string) {
    return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(iso));
}

function generateAIResponse(userMsg: string, history: ChatMessage[]): ChatMessage {
    const lower = userMsg.toLowerCase();
    const hasPolicy = history.some((m) => m.role === "ai" && m.policy);
    const isRefinement = lower.includes("refine") || lower.includes("strict") || lower.includes("change") || lower.includes("update") || lower.includes("modify") || lower.includes("add");

    // If this is a refinement of a previous policy
    if (hasPolicy && isRefinement) {
        const lastPolicy = [...history].reverse().find((m) => m.policy);
        if (lastPolicy?.policy) {
            const refined = { ...lastPolicy.policy };
            let refinedRules = { ...(lastPolicy.rules ?? {}) };

            if (lower.includes("strict")) {
                refined.severity = "high";
                refinedRules = { ...refinedRules, enforcement: "strict", auto_block: true };
                return {
                    id: `msg_${Date.now()}`, role: "ai",
                    content: `I've updated the policy to be **more strict**. Here are the changes:\n\n- Severity escalated to **High**\n- Enforcement mode set to **Strict** (auto-block violations)\n- Auto-blocking is now enabled\n\nHere's the updated policy:`,
                    policy: refined, rules: refinedRules,
                };
            }

            if (lower.includes("add") && lower.includes("exception")) {
                refinedRules = { ...refinedRules, exceptions: ["senior_engineers", "security_team"] };
                return {
                    id: `msg_${Date.now()}`, role: "ai",
                    content: `Done! I've added exceptions for **Senior Engineers** and **Security Team**. They will be exempt from this policy restriction.\n\nUpdated policy:`,
                    policy: refined, rules: refinedRules,
                };
            }

            // Generic refinement
            refined.description = refined.description + "\n\nAdditional requirement: " + userMsg;
            return {
                id: `msg_${Date.now()}`, role: "ai",
                content: `I've incorporated your feedback into the policy. The description has been updated with the additional requirements.\n\nReview the changes below:`,
                policy: refined, rules: refinedRules,
            };
        }
    }

    // If this is a follow-up question (no policy generation)
    if (hasPolicy && (lower.includes("what") || lower.includes("how") || lower.includes("why") || lower.includes("explain"))) {
        return {
            id: `msg_${Date.now()}`, role: "ai",
            content: `Great question! Here's some context:\n\n**How enforcement works:** Policies are checked against your connected integrations (GitHub, Slack, AWS, etc.) in real-time. When a violation is detected, the system can either:\n\n- **Advisory mode:** Log and alert, but don't block\n- **Strict mode:** Auto-block the action and notify the team\n\nYou can also configure notification channels and audit frequencies for each policy.\n\nWant me to adjust the enforcement settings, or would you like to generate a different policy?`,
        };
    }

    //  First-time policy generation 
    if (lower.includes("gpt-4") || lower.includes("model") || lower.includes("restrict")) {
        return {
            id: `msg_${Date.now()}`, role: "ai",
            content: `I've analyzed your requirements and generated a **Model Restrictions** policy. This will prevent developers from using expensive AI models while keeping cost-effective alternatives available.\n\nHere's the generated policy:`,
            policy: {
                name: "Restrict AI Models to Cost-Effective Options",
                description: "To control costs, developers are restricted to the following AI models:\n\nApproved Models:\n- Claude 3.5 Sonnet (Anthropic)\n- GPT-3.5 Turbo (OpenAI)\n\nProhibited Models:\n- GPT-4 (any variant)\n- GPT-4 Turbo\n\nRationale: Cost optimization while maintaining developer productivity.",
                category: "model_restrictions", severity: "high", applies_to: ["All Organizations"], creation_method: "ai_generated",
            },
            rules: { policy_name: "model_restrictions", allowed_models: ["claude-3-5-sonnet", "gpt-3.5-turbo"], forbidden_models: ["gpt-4*"], enforcement: "strict", severity: "high" },
        };
    }

    if (lower.includes("review") || lower.includes("human") || lower.includes("code")) {
        return {
            id: `msg_${Date.now()}`, role: "ai",
            content: `Absolutely. I've created a **Code Review** policy for AI-generated code. This ensures all AI outputs are human-verified before reaching production.\n\nHere's the policy:`,
            policy: {
                name: "Mandatory Human Review for AI-Generated Code",
                description: "All AI-generated code must go through human code review before merging to production branches.\n\nRequirements:\n- Minimum 2 reviewers required\n- At least 1 senior engineer must approve\n- AI-generated code must be labeled automatically",
                category: "quality_control", severity: "high", applies_to: ["Engineering"], creation_method: "ai_generated",
            },
            rules: { policy_name: "ai_code_review", min_reviewers: 2, require_senior_reviewer: true, auto_label_ai_code: true, enforcement: "strict" },
        };
    }

    if (lower.includes("secret") || lower.includes("scanning") || lower.includes("repo")) {
        return {
            id: `msg_${Date.now()}`, role: "ai",
            content: `Great call on security. I've created a **Secret Scanning** policy to prevent credential leaks across all repositories.\n\nHere's the policy:`,
            policy: {
                name: "Mandatory Secret Scanning for All Repositories",
                description: "All repositories must have secret scanning enabled.\n\nRequirements:\n- Push protection blocks commits with detected secrets\n- Alerts sent to security team via Slack and email\n- Weekly compliance audit of scanning status",
                category: "security", severity: "medium", applies_to: ["All Organizations"], creation_method: "ai_generated",
            },
            rules: { policy_name: "secret_scanning", scan_on_push: true, block_push_on_detection: true, notification_channels: ["slack", "email"], audit_frequency: "weekly" },
        };
    }

    if (lower.includes("rate") || lower.includes("limit") || lower.includes("cost") || lower.includes("usage") || lower.includes("quota")) {
        return {
            id: `msg_${Date.now()}`, role: "ai",
            content: `Smart move on cost control. I've generated an **API Rate Limiting** policy to cap AI model usage and prevent unexpected bills.\n\nHere's the policy:`,
            policy: {
                name: "API Rate Limiting for AI Models",
                description: "Set usage quotas and rate limits to control AI model API costs.\n\nLimits:\n- 60 requests/minute per user\n- 1M tokens/day organization-wide\n- Alert at 80% threshold\n- Hard block at 100%",
                category: "cost_management", severity: "medium", applies_to: ["All Organizations"], creation_method: "ai_generated",
            },
            rules: { policy_name: "api_rate_limiting", max_requests_per_minute: 60, max_tokens_per_day: 1000000, alert_at_80_percent: true, hard_block_at_100: true },
        };
    }

    // Default — generic policy generation
    return {
        id: `msg_${Date.now()}`, role: "ai",
        content: `I've analyzed your requirements and generated a governance policy. Here's what I came up with:\n\nYou can **refine** this by telling me to make changes, add exceptions, change severity, or adjust the enforcement rules. Just keep chatting!`,
        policy: {
            name: "AI Governance Policy",
            description: `Based on your requirements: "${userMsg}"\n\nThis policy establishes controls and governance guardrails for AI system usage.\n\nKey enforcement points:\n- Automated compliance monitoring\n- Periodic human review cycles\n- Audit trail for all changes`,
            category: "compliance", severity: "medium", applies_to: ["All Organizations"], creation_method: "ai_generated",
        },
        rules: { policy_name: "custom_governance", enforcement: "advisory", monitoring: true, review_cycle_days: 30, requires_approval: true },
    };
}

function GitHubChecksTab({
    policies,
    onToggle,
}: {
    policies: ScanPolicy[];
    onToggle: (checkId: string, enabled: boolean) => Promise<void>;
}) {
    const [toggling, setToggling] = useState<string | null>(null);
    const enabledCount = policies.filter(p => p.enabled).length;

    const handleToggle = async (p: ScanPolicy) => {
        setToggling(p.check_id);
        try {
            await onToggle(p.check_id, !p.enabled);
        } finally {
            setToggling(null);
        }
    };

    const personalChecks = policies.filter(p => p.tier !== "enterprise");
    const enterpriseChecks = policies.filter(p => p.tier === "enterprise");

    const renderCheck = (p: ScanPolicy) => (
        <div
            key={p.check_id}
            style={{
                padding: "var(--s-4)",
                borderRadius: "var(--r-md)",
                border: `1px solid ${p.enabled ? "var(--c-border)" : "rgba(255,255,255,0.05)"}`,
                background: p.enabled ? "var(--c-surface-elevated)" : "rgba(255,255,255,0.02)",
                opacity: p.enabled ? 1 : 0.6,
                display: "flex",
                alignItems: "flex-start",
                gap: "var(--s-4)",
                transition: "opacity 0.15s",
            }}
        >
            <div style={{ flex: 1 }}>
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-2)", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-13)" }}>{p.name}</span>
                    <span className={`badge badge--${p.severity === "high" ? "danger" : p.severity === "medium" ? "warning" : "neutral"}`} style={{ fontSize: "var(--fs-11)" }}>
                        {p.severity}
                    </span>
                    {p.tier === "enterprise" && (
                        <span className="badge badge--info" style={{ fontSize: "var(--fs-11)" }}>Enterprise</span>
                    )}
                    {p.enabled
                        ? <span className="badge badge--live" style={{ fontSize: "var(--fs-11)" }}>Active</span>
                        : <span className="badge badge--neutral" style={{ fontSize: "var(--fs-11)" }}>Disabled</span>}
                </div>
                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", lineHeight: 1.6, margin: 0 }}>
                    {p.description}
                </p>
            </div>
            <button
                type="button"
                className={`btn btn--sm ${p.enabled ? "btn--secondary" : "btn--ghost"}`}
                disabled={toggling === p.check_id}
                onClick={() => void handleToggle(p)}
                style={{ flexShrink: 0, marginTop: 2 }}
            >
                {toggling === p.check_id
                    ? "…"
                    : p.enabled
                        ? <><ToggleOnOutlinedIcon sx={{ fontSize: 16 }} /> Enabled</>
                        : <><ToggleOffOutlinedIcon sx={{ fontSize: 16 }} /> Disabled</>}
            </button>
        </div>
    );

    return (
        <div style={{ padding: "var(--s-5)", display: "flex", flexDirection: "column", gap: "var(--s-5)" }}>
            {/* Summary */}
            <div style={{ display: "flex", gap: "var(--s-4)", alignItems: "center", marginBottom: "var(--s-2)" }}>
                <div style={{ display: "flex", gap: "var(--s-3)" }}>
                    <span className="badge badge--live" style={{ padding: "4px 10px" }}>{enabledCount} active</span>
                    <span className="badge badge--neutral" style={{ padding: "4px 10px" }}>{policies.length - enabledCount} disabled</span>
                </div>
                <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginLeft: "auto" }}>
                    Changes take effect on next scan
                </span>
            </div>

            {policies.length === 0 && (
                <div style={{ padding: "var(--s-10)", textAlign: "center", color: "var(--c-text-muted)", fontSize: "var(--fs-13)" }}>
                    Loading checks…
                </div>
            )}

            {/* Personal / repo-level checks */}
            {personalChecks.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                    <p style={{ fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0" }}>
                        Repository Checks
                    </p>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                        {personalChecks.map(renderCheck)}
                    </div>
                </div>
            )}

            {/* Enterprise Copilot checks */}
            {enterpriseChecks.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)", marginTop: "var(--s-4)" }}>
                    <div>
                        <p style={{ fontSize: "var(--fs-11)", fontWeight: "var(--fw-bold)", color: "var(--c-text-muted)", textTransform: "uppercase", letterSpacing: "0.1em", margin: "0" }}>
                            Enterprise Copilot Checks
                        </p>
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-1)", lineHeight: 1.5 }}>
                            Requires GitHub Copilot Business or Enterprise. These checks are automatically skipped on personal accounts.
                        </p>
                    </div>
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                        {enterpriseChecks.map(renderCheck)}
                    </div>
                </div>
            )}
        </div>
    );
}

function isLikelyRefinement(message: string): boolean {
    const lower = message.toLowerCase();
    return lower.includes("refine")
        || lower.includes("strict")
        || lower.includes("change")
        || lower.includes("update")
        || lower.includes("modify")
        || lower.includes("add");
}
