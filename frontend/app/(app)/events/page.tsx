"use client";

import {
    BoltOutlinedIcon,
    FilterListOutlinedIcon,
    RefreshOutlinedIcon,
    SearchOutlinedIcon,
    TimelineOutlinedIcon,
} from "@/lib/icons";
import { useCallback, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/TopBar";
import { Modal } from "@/components/ui/Modal";
import { eventsApi, systemsApi } from "@/lib/api";
import { useAuth } from "@/providers/AuthProvider";

const EVENT_TYPES = [
    "model_invoked",
    "decision_generated",
    "data_accessed",
    "human_review_completed",
    "policy_checked",
] as const;

function toLocalInputValue(date: Date): string {
    const pad = (n: number) => String(n).padStart(2, "0");
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIsoOrUndefined(localValue: string): string | undefined {
    if (!localValue) return undefined;
    const date = new Date(localValue);
    if (Number.isNaN(date.getTime())) return undefined;
    return date.toISOString();
}

export default function EventsPage() {
    const queryClient = useQueryClient();
    const { user } = useAuth();
    const [systemFilter, setSystemFilter] = useState<string>("");
    const [eventTypeFilter, setEventTypeFilter] = useState<string>("");
    const [start, setStart] = useState("");
    const [end, setEnd] = useState("");
    const [search, setSearch] = useState("");
    const [offset, setOffset] = useState(0);
    const [showGenerator, setShowGenerator] = useState(false);
    const pageSize = 50;

    const { data: systemsPage } = useQuery({
        queryKey: ["systems", "events-page"],
        queryFn: () => systemsApi.list({ limit: 200 }),
    });
    const systems = systemsPage?.items ?? [];
    const systemNameById = useMemo(() => {
        const map = new Map<number, string>();
        for (const system of systems) map.set(system.id, system.name);
        return map;
    }, [systems]);

    const listParams = useMemo(
        () => ({
            limit: pageSize,
            offset,
            system_id: systemFilter ? Number(systemFilter) : undefined,
            event_type: eventTypeFilter || undefined,
            start: toIsoOrUndefined(start),
            end: toIsoOrUndefined(end),
        }),
        [offset, systemFilter, eventTypeFilter, start, end],
    );

    const { data: eventsPage, isFetching, refetch } = useQuery({
        queryKey: ["events", listParams],
        queryFn: () => eventsApi.list(listParams),
    });
    const events = eventsPage?.items ?? [];
    const total = eventsPage?.total ?? 0;
    const hasMore = eventsPage?.has_more ?? false;

    const filteredEvents = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return events;
        return events.filter((event) => {
            const systemName = systemNameById.get(event.system_id) ?? "";
            return (
                event.event_type.toLowerCase().includes(q) ||
                event.user_id.toLowerCase().includes(q) ||
                systemName.toLowerCase().includes(q) ||
                JSON.stringify(event.metadata).toLowerCase().includes(q)
            );
        });
    }, [events, search, systemNameById]);

    const createMutation = useMutation({
        mutationFn: eventsApi.create,
        onSuccess: async () => {
            await queryClient.invalidateQueries({ queryKey: ["events"] });
            await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
            setShowGenerator(false);
        },
    });

    const resetFilters = useCallback(() => {
        setSystemFilter("");
        setEventTypeFilter("");
        setStart("");
        setEnd("");
        setSearch("");
        setOffset(0);
    }, []);

    return (
        <>
            <TopBar
                title="Activity Events"
                subtitle={`${total} simulated activity event${total === 1 ? "" : "s"}`}
                actions={
                    <button type="button" className="btn btn--primary" onClick={() => setShowGenerator(true)}>
                        <BoltOutlinedIcon sx={{ fontSize: 16 }} /> Test Event Generator
                    </button>
                }
            />

            <main className="page">
                <div className="panel" style={{ marginBottom: "var(--s-4)" }}>
                    <div className="panel__header">
                        <span className="panel__title" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <FilterListOutlinedIcon sx={{ fontSize: 16 }} /> Filters
                        </span>
                        <div style={{ display: "flex", gap: "var(--s-2)" }}>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={() => void refetch()}>
                                <RefreshOutlinedIcon sx={{ fontSize: 14 }} /> Refresh
                            </button>
                            <button type="button" className="btn btn--ghost btn--sm" onClick={resetFilters}>
                                Clear
                            </button>
                        </div>
                    </div>
                    <div className="panel__body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s-3)" }}>
                        <div className="form-group">
                            <label className="form-label">System</label>
                            <select
                                className="input"
                                value={systemFilter}
                                onChange={(e) => {
                                    setSystemFilter(e.target.value);
                                    setOffset(0);
                                }}
                            >
                                <option value="">All systems</option>
                                {systems.map((system) => (
                                    <option key={system.id} value={system.id}>
                                        {system.name}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Event type</label>
                            <select
                                className="input"
                                value={eventTypeFilter}
                                onChange={(e) => {
                                    setEventTypeFilter(e.target.value);
                                    setOffset(0);
                                }}
                            >
                                <option value="">All types</option>
                                {EVENT_TYPES.map((type) => (
                                    <option key={type} value={type}>
                                        {type}
                                    </option>
                                ))}
                            </select>
                        </div>
                        <div className="form-group">
                            <label className="form-label">Start</label>
                            <input
                                className="input"
                                type="datetime-local"
                                value={start}
                                onChange={(e) => {
                                    setStart(e.target.value);
                                    setOffset(0);
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">End</label>
                            <input
                                className="input"
                                type="datetime-local"
                                value={end}
                                onChange={(e) => {
                                    setEnd(e.target.value);
                                    setOffset(0);
                                }}
                            />
                        </div>
                        <div className="form-group">
                            <label className="form-label">Search</label>
                            <div style={{ position: "relative" }}>
                                <SearchOutlinedIcon
                                    sx={{ fontSize: 14, color: "var(--c-text-muted)" }}
                                    style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)" }}
                                />
                                <input
                                    className="input"
                                    style={{ paddingLeft: 30 }}
                                    placeholder="user, type, metadata…"
                                    value={search}
                                    onChange={(e) => setSearch(e.target.value)}
                                />
                            </div>
                        </div>
                    </div>
                </div>

                <div className="panel">
                    <div className="panel__header">
                        <span className="panel__title" style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                            <TimelineOutlinedIcon sx={{ fontSize: 16 }} /> Event log
                        </span>
                        <span className="panel__subtitle">{isFetching ? "Loading…" : `${filteredEvents.length} on this page`}</span>
                    </div>
                    <div className="panel__body--flush">
                        {filteredEvents.length === 0 ? (
                            <div className="empty-state" style={{ padding: "var(--s-8)" }}>
                                <p className="empty-state__desc">No activity events match these filters.</p>
                                <button type="button" className="btn btn--secondary btn--sm" onClick={() => setShowGenerator(true)}>
                                    Generate a test event
                                </button>
                            </div>
                        ) : (
                            <table className="table">
                                <thead>
                                    <tr>
                                        <th>Timestamp</th>
                                        <th>System</th>
                                        <th>Event type</th>
                                        <th>User</th>
                                        <th>Metadata</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {filteredEvents.map((event) => (
                                        <tr key={event.id}>
                                            <td style={{ whiteSpace: "nowrap", fontSize: "var(--fs-12)" }}>
                                                {new Date(event.timestamp).toLocaleString()}
                                            </td>
                                            <td>{systemNameById.get(event.system_id) ?? `System #${event.system_id}`}</td>
                                            <td>
                                                <span className="badge badge--neutral">{event.event_type}</span>
                                            </td>
                                            <td style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)" }}>{event.user_id}</td>
                                            <td style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", maxWidth: 280 }}>
                                                <code style={{ whiteSpace: "pre-wrap" }}>
                                                    {Object.keys(event.metadata || {}).length
                                                        ? JSON.stringify(event.metadata)
                                                        : "—"}
                                                </code>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        )}
                    </div>
                </div>

                <div
                    style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        marginTop: "var(--s-4)",
                        paddingBottom: "var(--s-4)",
                        gap: "var(--s-3)",
                        flexWrap: "wrap",
                    }}
                >
                    <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                        Showing {total === 0 ? 0 : offset + 1}–{Math.min(offset + events.length, total)} of {total}
                    </span>
                    <div style={{ display: "flex", gap: "var(--s-2)" }}>
                        <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={offset <= 0}
                            onClick={() => setOffset((value) => Math.max(0, value - pageSize))}
                        >
                            Previous
                        </button>
                        <button
                            type="button"
                            className="btn btn--ghost btn--sm"
                            disabled={!hasMore}
                            onClick={() => setOffset((value) => value + pageSize)}
                        >
                            Next
                        </button>
                    </div>
                </div>
            </main>

            {showGenerator && (
                <TestEventGenerator
                    systems={systems}
                    defaultUserId={user?.uid || user?.email || "demo-user"}
                    submitting={createMutation.isPending}
                    error={createMutation.error instanceof Error ? createMutation.error.message : ""}
                    onCancel={() => setShowGenerator(false)}
                    onSubmit={async (payload) => {
                        await createMutation.mutateAsync(payload);
                    }}
                />
            )}
        </>
    );
}

function TestEventGenerator({
    systems,
    defaultUserId,
    submitting,
    error,
    onCancel,
    onSubmit,
}: {
    systems: Array<{ id: number; name: string }>;
    defaultUserId: string;
    submitting: boolean;
    error: string;
    onCancel: () => void;
    onSubmit: (payload: {
        system_id: number;
        timestamp: string;
        user_id: string;
        event_type: string;
        metadata?: Record<string, unknown>;
    }) => Promise<void>;
}) {
    const [systemId, setSystemId] = useState(systems[0] ? String(systems[0].id) : "");
    const [eventType, setEventType] = useState<string>(EVENT_TYPES[0]);
    const [userId, setUserId] = useState(defaultUserId);
    const [timestamp, setTimestamp] = useState(toLocalInputValue(new Date()));
    const [metadataText, setMetadataText] = useState('{\n  "source": "test-event-generator"\n}');
    const [localError, setLocalError] = useState("");

    const valid = Boolean(systemId) && Boolean(eventType) && Boolean(userId.trim());

    const handleCreate = () => {
        setLocalError("");
        let metadata: Record<string, unknown> = {};
        try {
            metadata = metadataText.trim() ? (JSON.parse(metadataText) as Record<string, unknown>) : {};
        } catch {
            setLocalError("Metadata must be valid JSON.");
            return;
        }
        const iso = toIsoOrUndefined(timestamp) ?? new Date().toISOString();
        void onSubmit({
            system_id: Number(systemId),
            timestamp: iso,
            user_id: userId.trim(),
            event_type: eventType,
            metadata,
        });
    };

    return (
        <Modal
            open
            onClose={onCancel}
            title="Test Event Generator"
            subtitle="Ingest a simulated activity event into the platform for demo and dashboard metrics."
            footer={
                <>
                    <button type="button" className="btn btn--secondary" onClick={onCancel}>
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="btn btn--primary"
                        disabled={!valid || submitting || systems.length === 0}
                        onClick={handleCreate}
                    >
                        {submitting ? "Creating…" : "Create event"}
                    </button>
                </>
            }
        >
            <div className="form-group">
                <label className="form-label" htmlFor="teg-system">System *</label>
                <select
                    id="teg-system"
                    className="input"
                    value={systemId}
                    onChange={(e) => setSystemId(e.target.value)}
                >
                    <option value="" disabled>
                        Select a system
                    </option>
                    {systems.map((system) => (
                        <option key={system.id} value={system.id}>
                            {system.name}
                        </option>
                    ))}
                </select>
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor="teg-event-type">Event type *</label>
                <select
                    id="teg-event-type"
                    className="input"
                    value={eventType}
                    onChange={(e) => setEventType(e.target.value)}
                >
                    {EVENT_TYPES.map((type) => (
                        <option key={type} value={type}>
                            {type}
                        </option>
                    ))}
                </select>
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor="teg-user-id">User ID *</label>
                <input
                    id="teg-user-id"
                    className="input"
                    value={userId}
                    onChange={(e) => setUserId(e.target.value)}
                />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor="teg-timestamp">Timestamp</label>
                <input
                    id="teg-timestamp"
                    className="input"
                    type="datetime-local"
                    value={timestamp}
                    onChange={(e) => setTimestamp(e.target.value)}
                />
            </div>
            <div className="form-group">
                <label className="form-label" htmlFor="teg-metadata">Metadata (JSON)</label>
                <textarea
                    id="teg-metadata"
                    className="input"
                    rows={5}
                    value={metadataText}
                    onChange={(e) => setMetadataText(e.target.value)}
                />
            </div>
            {(localError || error) && (
                <p style={{ color: "var(--c-critical)", fontSize: "var(--fs-12)", margin: 0 }}>{localError || error}</p>
            )}
        </Modal>
    );
}
