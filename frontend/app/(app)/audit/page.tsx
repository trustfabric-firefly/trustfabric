"use client";

import { useState, useCallback, useMemo } from "react";
import DocumentScannerOutlinedIcon from "@mui/icons-material/DocumentScannerOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PersonOutlinedIcon from "@mui/icons-material/PersonOutlined";
import SecurityOutlinedIcon from "@mui/icons-material/SecurityOutlined";
import AssessmentOutlinedIcon from "@mui/icons-material/AssessmentOutlined";
import LockOutlinedIcon from "@mui/icons-material/LockOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import FilterListOutlinedIcon from "@mui/icons-material/FilterListOutlined";
import FileDownloadOutlinedIcon from "@mui/icons-material/FileDownloadOutlined";
import ArrowBackOutlinedIcon from "@mui/icons-material/ArrowBackOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import ExpandMoreOutlinedIcon from "@mui/icons-material/ExpandMoreOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import AccessTimeOutlinedIcon from "@mui/icons-material/AccessTimeOutlined";
import ComputerOutlinedIcon from "@mui/icons-material/ComputerOutlined";
import LocationOnOutlinedIcon from "@mui/icons-material/LocationOnOutlined";
import KeyOutlinedIcon from "@mui/icons-material/KeyOutlined";
import RefreshOutlinedIcon from "@mui/icons-material/RefreshOutlined";
import type { SvgIconComponent } from "@mui/icons-material";
import { TopBar } from "@/components/layout/TopBar";
import type { AuditLogEntry, AuditActionCategory, AuditSeverity } from "@/types";


const CATEGORY_ICONS: Record<AuditActionCategory, SvgIconComponent> = {
    scan: DocumentScannerOutlinedIcon,
    policy: PolicyOutlinedIcon,
    system: SmartToyOutlinedIcon,
    settings: SettingsOutlinedIcon,
    user: PersonOutlinedIcon,
    security: SecurityOutlinedIcon,
    report: AssessmentOutlinedIcon,
    auth: LockOutlinedIcon,
};

const CATEGORY_LABELS: Record<AuditActionCategory, string> = {
    scan: "Scan Activity",
    policy: "Policy Activity",
    system: "AI System Activity",
    settings: "Settings Change",
    user: "User Management",
    security: "Security Event",
    report: "Report Generated",
    auth: "Authentication",
};

const DATE_RANGE_OPTIONS = [
    { value: "24h", label: "Last 24 hours" },
    { value: "7d", label: "Last 7 days" },
    { value: "30d", label: "Last 30 days" },
    { value: "90d", label: "Last 90 days" },
    { value: "year", label: "This year" },
    { value: "all", label: "All time" },
];

//mock data/

const MOCK_AUDIT_LOG: AuditLogEntry[] = [
    {
        event_id: "evt_001",
        timestamp: "2026-02-16T14:35:42Z",
        user_id: "user_xyz789",
        user_email: "john.doe@acme.com",
        user_role: "Compliance Officer",
        ip_address: "192.168.1.100",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.6167",
        location: { city: "Dallas", region: "Texas", country: "US" },
        event_type: "compliance_scan_completed",
        action: "scan.run",
        action_category: "scan",
        severity: "info",
        status: "success",
        resource: { type: "github_organization", id: "acme-corp", name: "Acme Corporation" },
        result: { compliance_score: 0.67, violations_count: 2, scan_duration: 28 },
        metadata: { scan_id: "scan_xyz789", policies_checked: 3, duration_seconds: 28 },
        api_calls: [
            { service: "github", endpoint: "/orgs/acme-corp/copilot/settings", method: "GET", status: 200 },
            { service: "anthropic", endpoint: "/v1/messages", method: "POST", status: 200 },
        ],
    },
    {
        event_id: "evt_002",
        timestamp: "2026-02-16T10:15:00Z",
        user_id: "user_admin",
        user_email: "admin@acme.com",
        user_role: "Administrator",
        ip_address: "192.168.1.50",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        event_type: "policy_created",
        action: "policy.create",
        action_category: "policy",
        severity: "info",
        status: "success",
        resource: { type: "policy", id: "pol_abc123", name: "Restrict AI Models" },
        metadata: { creation_method: "ai_generated", severity: "high", category: "model_restrictions" },
    },
    {
        event_id: "evt_003",
        timestamp: "2026-02-16T09:30:00Z",
        user_id: "user_admin",
        user_email: "admin@acme.com",
        user_role: "Administrator",
        ip_address: "192.168.1.50",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        event_type: "api_key_rotated",
        action: "integration.api_key_rotated",
        action_category: "security",
        severity: "critical",
        status: "success",
        resource: { type: "integration", id: "github_acme_corp", name: "GitHub (acme-corp)" },
        changes: {
            before: { token_prefix: "ghp_xxxx...xxx1234", status: "active" },
            after: { token_prefix: "ghp_yyyy...yyy5678", status: "active" },
        },
        metadata: { rotation_reason: "Scheduled maintenance", expiration_days: 90 },
    },
    {
        event_id: "evt_004",
        timestamp: "2026-02-15T16:20:00Z",
        user_id: "user_jane",
        user_email: "jane.smith@acme.com",
        user_role: "Compliance Officer",
        ip_address: "192.168.1.75",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_2) AppleWebKit/605.1.15 Safari/17.2",
        location: { city: "San Francisco", region: "California", country: "US" },
        event_type: "ai_system_registered",
        action: "system.create",
        action_category: "system",
        severity: "info",
        status: "success",
        resource: { type: "ai_system", id: "sys_chatgpt", name: "ChatGPT Enterprise - Customer Support" },
        metadata: { risk_level: "critical", data_sensitivity: "High", department: "Customer Support" },
    },
    {
        event_id: "evt_005",
        timestamp: "2026-02-15T09:15:00Z",
        user_id: "user_xyz789",
        user_email: "john.doe@acme.com",
        user_role: "Compliance Officer",
        ip_address: "192.168.1.100",
        user_agent: "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/121.0.6167",
        event_type: "compliance_scan_completed",
        action: "scan.run",
        action_category: "scan",
        severity: "info",
        status: "success",
        resource: { type: "github_organization", id: "acme-corp", name: "Acme Corporation" },
        result: { compliance_score: 1.0, violations_count: 0 },
        metadata: { scan_id: "scan_abc456", policies_checked: 3 },
    },
    {
        event_id: "evt_006",
        timestamp: "2026-02-14T14:30:00Z",
        user_id: "user_admin",
        user_email: "admin@acme.com",
        user_role: "Administrator",
        ip_address: "192.168.1.50",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        event_type: "integration_updated",
        action: "settings.update",
        action_category: "settings",
        severity: "warning",
        status: "success",
        resource: { type: "integration", id: "github_main", name: "GitHub Integration" },
        changes: {
            before: { organization: "old-org" },
            after: { organization: "acme-corp" },
        },
    },
    {
        event_id: "evt_007",
        timestamp: "2026-02-14T11:05:00Z",
        user_id: "user_admin",
        user_email: "admin@acme.com",
        user_role: "Administrator",
        ip_address: "192.168.1.50",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        event_type: "policy_updated",
        action: "policy.update",
        action_category: "policy",
        severity: "info",
        status: "success",
        resource: { type: "policy", id: "pol_cli", name: "Disable Copilot CLI" },
        changes: {
            before: { severity: "low" },
            after: { severity: "high" },
        },
    },
    {
        event_id: "evt_008",
        timestamp: "2026-02-14T10:00:00Z",
        user_id: "user_admin",
        user_email: "admin@acme.com",
        user_role: "Administrator",
        ip_address: "192.168.1.50",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        event_type: "user_invited",
        action: "user.invite",
        action_category: "user",
        severity: "info",
        status: "success",
        resource: { type: "user", id: "user_jane", name: "jane.smith@acme.com" },
        metadata: { role: "Compliance Officer", department: "Engineering" },
    },
    {
        event_id: "evt_009",
        timestamp: "2026-02-13T07:45:00Z",
        user_id: "unknown",
        user_email: "unknown@example.com",
        ip_address: "203.0.113.42",
        user_agent: "curl/7.88.1",
        event_type: "login_failed",
        action: "auth.login_failed",
        action_category: "auth",
        severity: "warning",
        status: "failure",
        resource: { type: "auth", id: "login_attempt", name: "Login Attempt" },
        metadata: { reason: "User account does not exist", attempts_from_ip: 5 },
    },
    {
        event_id: "evt_010",
        timestamp: "2026-02-12T15:30:00Z",
        user_id: "user_admin",
        user_email: "admin@acme.com",
        user_role: "Administrator",
        ip_address: "192.168.1.50",
        user_agent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:122.0) Gecko/20100101 Firefox/122.0",
        event_type: "report_exported",
        action: "report.export",
        action_category: "report",
        severity: "info",
        status: "success",
        resource: { type: "report", id: "rpt_compliance", name: "Compliance Report Q1 2026" },
        metadata: { format: "PDF", pages: 24, recipients: ["cto@acme.com", "ciso@acme.com"] },
    },
];

//main page

type PageView = "list" | "details";

export default function AuditPage() {
    const [view, setView] = useState<PageView>("list");
    const [selectedEvent, setSelectedEvent] = useState<AuditLogEntry | null>(null);
    const [showExportMenu, setShowExportMenu] = useState(false);

    const handleViewDetails = useCallback((event: AuditLogEntry) => {
        setSelectedEvent(event);
        setView("details");
    }, []);

    const handleBack = useCallback(() => {
        setView("list");
        setSelectedEvent(null);
    }, []);

    // Stats
    const totalEvents = MOCK_AUDIT_LOG.length;
    const uniqueUsers = new Set(MOCK_AUDIT_LOG.map((e) => e.user_email)).size;
    const criticalEvents = MOCK_AUDIT_LOG.filter((e) => e.severity === "critical").length;

    return (
        <>
            <TopBar
                title="Audit Log"
                subtitle={`${totalEvents} events recorded`}
                actions={
                    view === "list" ? (
                        <div style={{ position: "relative" }}>
                            <button
                                className="btn btn--secondary"
                                onClick={() => setShowExportMenu(!showExportMenu)}
                            >
                                <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} /> Export Log
                                <ExpandMoreOutlinedIcon sx={{ fontSize: 16 }} />
                            </button>
                            {showExportMenu && (
                                <ExportMenu onClose={() => setShowExportMenu(false)} />
                            )}
                        </div>
                    ) : undefined
                }
            />

            <main className="page">
                {view === "list" && (
                    <ListView
                        events={MOCK_AUDIT_LOG}
                        totalEvents={totalEvents}
                        uniqueUsers={uniqueUsers}
                        criticalEvents={criticalEvents}
                        onViewDetails={handleViewDetails}
                    />
                )}

                {view === "details" && selectedEvent && (
                    <DetailsView
                        event={selectedEvent}
                        onBack={handleBack}
                    />
                )}
            </main>
        </>
    );
}


function ListView({
    events,
    totalEvents,
    uniqueUsers,
    criticalEvents,
    onViewDetails,
}: {
    events: AuditLogEntry[];
    totalEvents: number;
    uniqueUsers: number;
    criticalEvents: number;
    onViewDetails: (event: AuditLogEntry) => void;
}) {
    const [search, setSearch] = useState("");
    const [userFilter, setUserFilter] = useState("all");
    const [actionFilter, setActionFilter] = useState<"all" | AuditActionCategory>("all");
    const [dateFilter, setDateFilter] = useState("30d");
    const [severityFilters, setSeverityFilters] = useState<AuditSeverity[]>(["info", "warning", "critical"]);
    const [showFilters, setShowFilters] = useState(false);
    const [visibleCount, setVisibleCount] = useState(10);

    const uniqueUserEmails = useMemo(() => {
        const emails = new Set(events.map((e) => e.user_email));
        return Array.from(emails);
    }, [events]);

    const filtered = useMemo(() => {
        return events
            .filter((e) => userFilter === "all" || e.user_email === userFilter)
            .filter((e) => actionFilter === "all" || e.action_category === actionFilter)
            .filter((e) => severityFilters.includes(e.severity))
            .filter((e) =>
                !search ||
                e.user_email.toLowerCase().includes(search.toLowerCase()) ||
                e.event_type.toLowerCase().includes(search.toLowerCase()) ||
                e.resource.name?.toLowerCase().includes(search.toLowerCase())
            );
    }, [events, userFilter, actionFilter, severityFilters, search]);

    // Group by date
    const groupedByDate = useMemo(() => {
        const groups: Record<string, AuditLogEntry[]> = {};
        filtered.forEach((event) => {
            const dateKey = formatDateKey(event.timestamp);
            if (!groups[dateKey]) groups[dateKey] = [];
            groups[dateKey].push(event);
        });
        return groups;
    }, [filtered]);

    const toggleSeverity = (sev: AuditSeverity) => {
        setSeverityFilters((prev) =>
            prev.includes(sev) ? prev.filter((s) => s !== sev) : [...prev, sev]
        );
    };

    const resetFilters = () => {
        setSearch("");
        setUserFilter("all");
        setActionFilter("all");
        setDateFilter("30d");
        setSeverityFilters(["info", "warning", "critical"]);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            {/* Filters Panel */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Filters</span>
                    <button className="btn btn--ghost btn--sm" onClick={() => setShowFilters(!showFilters)}>
                        {showFilters ? "Hide" : "Show"} Filters
                    </button>
                </div>
                {showFilters && (
                    <div className="panel__body" style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                        {/* Search */}
                        <div className="search-bar">
                            <span className="search-bar__icon"><SearchOutlinedIcon sx={{ fontSize: 16 }} /></span>
                            <input
                                className="input"
                                placeholder="Search activity..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                            />
                        </div>

                        {/* Filter Row */}
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "var(--s-3)" }}>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">User</label>
                                <select className="input" value={userFilter} onChange={(e) => setUserFilter(e.target.value)}>
                                    <option value="all">All Users</option>
                                    {uniqueUserEmails.map((email) => (
                                        <option key={email} value={email}>{email}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Action</label>
                                <select className="input" value={actionFilter} onChange={(e) => setActionFilter(e.target.value as typeof actionFilter)}>
                                    <option value="all">All Actions</option>
                                    {Object.entries(CATEGORY_LABELS).map(([key, label]) => (
                                        <option key={key} value={key}>{label}</option>
                                    ))}
                                </select>
                            </div>
                            <div className="form-group" style={{ marginBottom: 0 }}>
                                <label className="form-label">Date Range</label>
                                <select className="input" value={dateFilter} onChange={(e) => setDateFilter(e.target.value)}>
                                    {DATE_RANGE_OPTIONS.map((opt) => (
                                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                                    ))}
                                </select>
                            </div>
                        </div>

                        {/* Severity Checkboxes */}
                        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-4)" }}>
                            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>Severity:</span>
                            {(["info", "warning", "critical"] as AuditSeverity[]).map((sev) => (
                                <label key={sev} className="checkbox-label">
                                    <input
                                        type="checkbox"
                                        checked={severityFilters.includes(sev)}
                                        onChange={() => toggleSeverity(sev)}
                                    />
                                    <span style={{ textTransform: "capitalize" }}>{sev}</span>
                                </label>
                            ))}
                        </div>

                        {/* Actions */}
                        <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-2)" }}>
                            <button className="btn btn--secondary" onClick={resetFilters}>
                                <RefreshOutlinedIcon sx={{ fontSize: 14 }} /> Reset Filters
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Activity Summary */}
            <div className="stats-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)" }}>
                <div className="stat-card stat-card--info">
                    <div className="stat-card__label">Total Events</div>
                    <div className="stat-card__value">{totalEvents}</div>
                </div>
                <div className="stat-card stat-card--success">
                    <div className="stat-card__label">Users Active</div>
                    <div className="stat-card__value">{uniqueUsers}</div>
                </div>
                <div className="stat-card stat-card--danger">
                    <div className="stat-card__label">Critical Events</div>
                    <div className="stat-card__value">{criticalEvents}</div>
                </div>
            </div>

            {/* Activity Timeline */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Activity Timeline</span>
                    <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                        {filtered.length} events
                    </span>
                </div>
                <div className="panel__body--flush">
                    {filtered.length === 0 ? (
                        <div className="empty-state" style={{ padding: "var(--s-6)" }}>
                            <p className="empty-state__desc">No events match your filters.</p>
                        </div>
                    ) : (
                        <>
                            {Object.entries(groupedByDate).slice(0, Math.ceil(visibleCount / 3)).map(([dateKey, dateEvents]) => (
                                <div key={dateKey}>
                                    <div className="audit-date-header">{dateKey}</div>
                                    {dateEvents.slice(0, visibleCount).map((event) => (
                                        <ActivityItem
                                            key={event.event_id}
                                            event={event}
                                            onViewDetails={() => onViewDetails(event)}
                                        />
                                    ))}
                                </div>
                            ))}

                            <div style={{ padding: "var(--s-4)", display: "flex", alignItems: "center", justifyContent: "space-between", borderTop: "1px solid var(--c-border)" }}>
                                <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                    Showing {Math.min(visibleCount, filtered.length)} of {filtered.length} activities
                                </span>
                                <div style={{ display: "flex", gap: "var(--s-2)" }}>
                                    {visibleCount < filtered.length && (
                                        <>
                                            <button
                                                className="btn btn--secondary btn--sm"
                                                onClick={() => setVisibleCount((c) => c + 10)}
                                            >
                                                Load More (10)
                                            </button>
                                            <button
                                                className="btn btn--ghost btn--sm"
                                                onClick={() => setVisibleCount(filtered.length)}
                                            >
                                                Load All
                                            </button>
                                        </>
                                    )}
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
}

//details 

function DetailsView({
    event,
    onBack,
}: {
    event: AuditLogEntry;
    onBack: () => void;
}) {
    const CategoryIcon = CATEGORY_ICONS[event.action_category];

    const copyToClipboard = (text: string) => {
        navigator.clipboard.writeText(text);
    };

    return (
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
            <button className="btn btn--ghost btn--sm" style={{ alignSelf: "flex-start", gap: 4 }} onClick={onBack}>
                <ArrowBackOutlinedIcon sx={{ fontSize: 14 }} /> Back to Audit Log
            </button>

            {/* Header */}
            <div className="panel">
                <div className="panel__body">
                    <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-4)" }}>
                        <div className="audit-detail__icon">
                            <CategoryIcon sx={{ fontSize: 24 }} />
                        </div>
                        <div style={{ flex: 1 }}>
                            <h2 style={{ fontSize: "var(--fs-18)", fontWeight: "var(--fw-semibold)", color: "var(--c-text)", marginBottom: 4 }}>
                                {CATEGORY_LABELS[event.action_category]}
                            </h2>
                            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-muted)" }}>
                                {formatFullDateTime(event.timestamp)}
                            </p>
                        </div>
                        <SeverityBadge severity={event.severity} />
                    </div>
                </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
                {/* Activity Information */}
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">Activity Information</span>
                    </div>
                    <div className="panel__body">
                        <DetailRow label="Event ID" value={event.event_id} copyable />
                        <DetailRow label="Event Type" value={event.event_type} />
                        <DetailRow label="Action" value={event.action} />
                        <DetailRow label="Status" value={<StatusBadge status={event.status} />} />
                    </div>
                </div>

                {/* User Details */}
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">User Details</span>
                    </div>
                    <div className="panel__body">
                        <DetailRow label="Performed By" value={event.user_email} />
                        <DetailRow label="User ID" value={event.user_id} />
                        {event.user_role && <DetailRow label="Role" value={event.user_role} />}
                    </div>
                </div>
            </div>

            {/* Session Information */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Session Information</span>
                </div>
                <div className="panel__body">
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
                        <div>
                            <DetailRow
                                icon={LocationOnOutlinedIcon}
                                label="IP Address"
                                value={event.ip_address}
                            />
                            {event.location && (
                                <DetailRow
                                    icon={LocationOnOutlinedIcon}
                                    label="Location"
                                    value={`${event.location.city}, ${event.location.region}, ${event.location.country}`}
                                />
                            )}
                        </div>
                        <div>
                            <DetailRow
                                icon={ComputerOutlinedIcon}
                                label="Device"
                                value={parseUserAgent(event.user_agent)}
                            />
                            {event.session_id && (
                                <DetailRow
                                    icon={KeyOutlinedIcon}
                                    label="Session ID"
                                    value={event.session_id}
                                />
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Resource Details */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Action Details</span>
                </div>
                <div className="panel__body">
                    <DetailRow label="Target" value={`${event.resource.name || event.resource.id} (${event.resource.type})`} />

                    {event.result && (
                        <div style={{ marginTop: "var(--s-3)" }}>
                            <span style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)" }}>Results:</span>
                            <ul style={{ marginTop: "var(--s-1)", paddingLeft: "var(--s-4)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                                {Object.entries(event.result).map(([key, value]) => (
                                    <li key={key}>{formatKey(key)}: {String(value)}</li>
                                ))}
                            </ul>
                        </div>
                    )}

                    {event.metadata && (
                        <div style={{ marginTop: "var(--s-3)" }}>
                            <span style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)" }}>Metadata:</span>
                            <ul style={{ marginTop: "var(--s-1)", paddingLeft: "var(--s-4)", fontSize: "var(--fs-13)", color: "var(--c-text-secondary)" }}>
                                {Object.entries(event.metadata).map(([key, value]) => (
                                    <li key={key}>{formatKey(key)}: {String(value)}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                </div>
            </div>

            {/* Changes */}
            {event.changes && (event.changes.before || event.changes.after) && (
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">Changes Made</span>
                    </div>
                    <div className="panel__body">
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-4)" }}>
                            {event.changes.before && (
                                <div>
                                    <span style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", marginBottom: "var(--s-2)", display: "block" }}>Before:</span>
                                    <div className="code-block">{JSON.stringify(event.changes.before, null, 2)}</div>
                                </div>
                            )}
                            {event.changes.after && (
                                <div>
                                    <span style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-text-muted)", marginBottom: "var(--s-2)", display: "block" }}>After:</span>
                                    <div className="code-block">{JSON.stringify(event.changes.after, null, 2)}</div>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* API Calls */}
            {event.api_calls && event.api_calls.length > 0 && (
                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title">API Calls Made</span>
                    </div>
                    <div className="panel__body--flush">
                        <table className="table table--compact">
                            <thead>
                                <tr>
                                    <th>Service</th>
                                    <th>Method</th>
                                    <th>Endpoint</th>
                                    <th>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {event.api_calls.map((call, i) => (
                                    <tr key={i}>
                                        <td style={{ fontWeight: "var(--fw-medium)" }}>{call.service}</td>
                                        <td><span className="badge badge--neutral">{call.method}</span></td>
                                        <td className="font-mono" style={{ fontSize: "var(--fs-11)" }}>{call.endpoint}</td>
                                        <td>
                                            <span className={`badge badge--${call.status < 400 ? "live" : "danger"}`}>
                                                {call.status}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Raw Event Data */}
            <div className="panel">
                <div className="panel__header">
                    <span className="panel__title">Raw Event Data (JSON)</span>
                </div>
                <div className="panel__body">
                    <div className="code-block" style={{ maxHeight: 300, overflow: "auto" }}>
                        {JSON.stringify(event, null, 2)}
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: "flex", justifyContent: "flex-end", gap: "var(--s-2)" }}>
                <button className="btn btn--secondary" onClick={() => copyToClipboard(event.event_id)}>
                    <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} /> Copy Event ID
                </button>
                <button className="btn btn--secondary" onClick={() => copyToClipboard(JSON.stringify(event, null, 2))}>
                    <ContentCopyOutlinedIcon sx={{ fontSize: 14 }} /> Copy Raw JSON
                </button>
                <button className="btn btn--primary">
                    <FileDownloadOutlinedIcon sx={{ fontSize: 14 }} /> Download Event Data
                </button>
            </div>
        </div>
    );
}

//sub components

function ActivityItem({
    event,
    onViewDetails,
}: {
    event: AuditLogEntry;
    onViewDetails: () => void;
}) {
    const CategoryIcon = CATEGORY_ICONS[event.action_category];

    return (
        <div className="audit-item" onClick={onViewDetails}>
            <div className="audit-item__icon">
                <CategoryIcon sx={{ fontSize: 18 }} />
            </div>
            <div className="audit-item__time">{formatTime(event.timestamp)}</div>
            <div className="audit-item__content">
                <div className="audit-item__summary">
                    <strong>{event.user_email}</strong> {formatEventDescription(event)}
                </div>
                <div className="audit-item__details">
                    {event.resource.name || event.resource.id}
                    {event.result && "compliance_score" in event.result && (
                        <span> | Result: {Math.round((event.result.compliance_score as number) * 100)}% compliant</span>
                    )}
                </div>
                <div className="audit-item__meta">
                    IP: {event.ip_address} | Device: {parseUserAgent(event.user_agent)}
                </div>
            </div>
            <div className="audit-item__badges">
                {event.severity === "critical" && (
                    <span className="badge badge--danger">CRITICAL</span>
                )}
                {event.severity === "warning" && (
                    <span className="badge badge--warning">WARNING</span>
                )}
            </div>
            <button className="btn btn--ghost btn--sm" onClick={(e) => { e.stopPropagation(); onViewDetails(); }}>
                Details
            </button>
        </div>
    );
}

function ExportMenu({ onClose }: { onClose: () => void }) {
    return (
        <>
            <div className="dropdown-overlay" onClick={onClose} />
            <div className="dropdown-menu" style={{ right: 0, top: "100%", marginTop: 4 }}>
                <button className="dropdown-item">
                    <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} /> Download CSV
                </button>
                <button className="dropdown-item">
                    <FileDownloadOutlinedIcon sx={{ fontSize: 16 }} /> Download JSON
                </button>
                <button className="dropdown-item">
                    <AssessmentOutlinedIcon sx={{ fontSize: 16 }} /> Generate PDF Report
                </button>
            </div>
        </>
    );
}

function SeverityBadge({ severity }: { severity: AuditSeverity }) {
    const config = {
        info: { label: "Info", class: "badge--info", icon: CheckCircleOutlinedIcon },
        warning: { label: "Warning", class: "badge--warning", icon: WarningAmberOutlinedIcon },
        critical: { label: "Critical", class: "badge--danger", icon: ErrorOutlineOutlinedIcon },
    };
    const c = config[severity];
    const Icon = c.icon;

    return (
        <span className={`badge ${c.class}`} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
            <Icon sx={{ fontSize: 12 }} /> {c.label}
        </span>
    );
}

function StatusBadge({ status }: { status: "success" | "failure" | "pending" }) {
    const config = {
        success: { label: "Success", class: "badge--live" },
        failure: { label: "Failed", class: "badge--danger" },
        pending: { label: "Pending", class: "badge--warning" },
    };
    const c = config[status];

    return <span className={`badge ${c.class}`}>{c.label}</span>;
}

function DetailRow({
    icon: Icon,
    label,
    value,
    copyable,
}: {
    icon?: SvgIconComponent;
    label: string;
    value: React.ReactNode;
    copyable?: boolean;
}) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", padding: "var(--s-2) 0" }}>
            {Icon && <Icon sx={{ fontSize: 16, color: "var(--c-text-muted)" }} />}
            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", minWidth: 100 }}>{label}</span>
            <span style={{ fontSize: "var(--fs-13)", color: "var(--c-text)", fontWeight: "var(--fw-medium)", flex: 1 }}>
                {value}
            </span>
            {copyable && typeof value === "string" && (
                <button
                    className="btn btn--ghost btn--sm"
                    style={{ padding: 4 }}
                    onClick={() => navigator.clipboard.writeText(value)}
                >
                    <ContentCopyOutlinedIcon sx={{ fontSize: 12 }} />
                </button>
            )}
        </div>
    );
}

// helpers

function formatDateKey(iso: string): string {
    const date = new Date(iso);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return `TODAY - ${formatDate(iso)}`;
    }
    if (date.toDateString() === yesterday.toDateString()) {
        return `YESTERDAY - ${formatDate(iso)}`;
    }
    return formatDate(iso);
}

function formatDate(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
    }).format(new Date(iso));
}

function formatTime(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        hour: "numeric",
        minute: "2-digit",
    }).format(new Date(iso));
}

function formatFullDateTime(iso: string): string {
    return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
        hour: "numeric",
        minute: "2-digit",
        second: "2-digit",
        timeZoneName: "short",
    }).format(new Date(iso));
}

function parseUserAgent(ua: string): string {
    if (ua.includes("Chrome")) return "Chrome on " + (ua.includes("Mac") ? "macOS" : ua.includes("Windows") ? "Windows" : "Linux");
    if (ua.includes("Firefox")) return "Firefox on " + (ua.includes("Windows") ? "Windows" : ua.includes("Mac") ? "macOS" : "Linux");
    if (ua.includes("Safari") && !ua.includes("Chrome")) return "Safari on macOS";
    if (ua.includes("curl")) return "curl (automated)";
    return "Unknown";
}

function formatEventDescription(event: AuditLogEntry): string {
    const descriptions: Record<string, string> = {
        "compliance_scan_completed": "ran compliance scan",
        "policy_created": "created policy",
        "policy_updated": "updated policy",
        "policy_deleted": "deleted policy",
        "ai_system_registered": "registered AI system",
        "ai_system_updated": "updated AI system",
        "api_key_rotated": "rotated API token",
        "integration_updated": "updated integration",
        "user_invited": "invited new user",
        "login_failed": "failed login attempt",
        "report_exported": "exported report",
    };
    return descriptions[event.event_type] || event.event_type.replace(/_/g, " ");
}

function formatKey(key: string): string {
    return key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}
