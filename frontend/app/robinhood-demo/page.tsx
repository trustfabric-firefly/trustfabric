"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
    SecurityOutlinedIcon,
    CancelOutlinedIcon,
    OpenInNewOutlinedIcon,
    SmartToyOutlinedIcon,
    SearchOutlinedIcon,
} from "@/lib/icons";
import {
    evaluateDemoCopilotMessage,
    getScenarioWelcomeMessage,
    getSuggestedPrompts,
    type DemoCopilotContext,
    type DemoScenarioId,
} from "@/lib/demo-copilot";

type ScenarioConfig = {
    id: DemoScenarioId;
    vendorName: string;
    title: string;
    description: string;
    ruleName: string;
    ruleId: string;
    ruleDesc: string;
    actionLabel: string;
};

const SCENARIOS: ScenarioConfig[] = [
    {
        id: "robinhood",
        vendorName: "Robinhood Financial",
        title: "Robinhood Web Trading (Wealth Management)",
        description: "Retail / Hedge Fund AI Assistant attempts to execute a live $1,760.10 stock order on Dunder Mifflin Inc (DMI).",
        ruleName: "Financial Trade Execution Guardrail",
        ruleId: "POL-SEC-FIN-001",
        ruleDesc: "Direct financial market orders strictly prohibited without licensed Human Portfolio Manager sign-off.",
        actionLabel: "Market Order (Buy 10 DMI @ $176.01)",
    },
    {
        id: "substack",
        vendorName: "Substack Publishing",
        title: "Substack Creator Portal (Editorial & Content)",
        description: "AI Macro Analysis Assistant attempts to auto-publish an un-reviewed market report to 50,000 paid subscribers.",
        ruleName: "Editorial Human-in-the-Loop Sign-Off",
        ruleId: "POL-PUB-HITL-003",
        ruleDesc: "Automated content publishing to public newsletter feeds requires Chief Editor verification.",
        actionLabel: "Publish Post to 50,000 Subscribers",
    },
    {
        id: "postgres",
        vendorName: "pgAdmin / Enterprise DB",
        title: "Supabase / Enterprise DB Console (SQL Ops)",
        description: "Logistics AI Agent attempts to execute an un-sanitized SQL UPDATE statement on production fleet database.",
        ruleName: "MCP Database Write Guardrail",
        ruleId: "POL-DB-MCP-004",
        ruleDesc: "MCP database integrations restricted to read-only SELECT queries. UPDATE & DELETE statements blocked.",
        actionLabel: "SQL UPDATE Query Execution",
    },
    {
        id: "healthcare",
        vendorName: "Epic Hyperspace EMR",
        title: "Epic EMR Clinical Portal (HIPAA HealthTech)",
        description: "Patient Support AI Agent attempts to transmit unencrypted Patient SSN & Clinical Records to external LLMs.",
        ruleName: "HIPAA & PII Data Redaction Scope",
        ruleId: "POL-HIPAA-PII-002",
        ruleDesc: "Patient SSNs, MRNs, and medical diagnosis payloads must be redacted prior to LLM processing.",
        actionLabel: "Transmit Patient SSN & Clinical Record",
    },
];

export default function StandaloneEnterpriseDemoPage() {
    const [selectedScenarioId, setSelectedScenarioId] = useState<DemoScenarioId>("robinhood");
    const [trustFabricEnabled, setTrustFabricEnabled] = useState(true);

    // Robinhood state
    const [shares, setShares] = useState(10);
    const [availableCash, setAvailableCash] = useState(3855.60);
    const [ownedShares, setOwnedShares] = useState(0);
    const [timeframe, setTimeframe] = useState("Today");

    // Substack state
    const [articleTitle, setArticleTitle] = useState("Q3 Inflation & Federal Reserve Rate Decision Analysis");
    const [articleBody, setArticleBody] = useState("Based on FRED macro data, core CPI rose 0.2% month-over-month. The Federal Reserve is expected to maintain current rates. Automated draft prepared by Econ-LLM Bot.");

    // Postgres state
    const [sqlQuery, setSqlQuery] = useState("UPDATE fleet_schedules SET dispatch_status = 'CANCELLED' WHERE location = 'Permian Basin';");

    // Healthcare state
    const [patientNotes, setPatientNotes] = useState("Patient Johnathan Miller (MRN: #8941092, SSN: XXX-XX-4912) presented with acute chest tightness. Recommended EKG & cardiology consult.");

    // Modal & Loading state
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [blockedModalOpen, setBlockedModalOpen] = useState(false);
    const [executedModalOpen, setExecutedModalOpen] = useState(false);

    // AI Copilot Drawer State
    const [copilotOpen, setCopilotOpen] = useState(false);
    const [copilotInput, setCopilotInput] = useState("");
    const [chatMessages, setChatMessages] = useState<Array<{ sender: "user" | "agent" | "system"; text: string; blocked?: boolean; timestamp: string }>>([
        getScenarioWelcomeMessage(SCENARIOS[0]),
    ]);
    const [copilotThinking, setCopilotThinking] = useState(false);
    const copilotTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

    const activeScenario = SCENARIOS.find((s) => s.id === selectedScenarioId) ?? SCENARIOS[0];
    const marketPrice = 176.01;
    const estimatedCost = shares * marketPrice;

    const handleActionExecute = () => {
        if (isSubmitting) return;
        setIsSubmitting(true);

        setTimeout(() => {
            setIsSubmitting(false);
            if (trustFabricEnabled) {
                setBlockedModalOpen(true);
            } else {
                if (selectedScenarioId === "robinhood") {
                    setAvailableCash((prev) => Math.max(0, prev - estimatedCost));
                    setOwnedShares((prev) => prev + shares);
                }
                setExecutedModalOpen(true);
            }
        }, 500);
    };

    useEffect(() => {
        return () => {
            if (copilotTimeoutRef.current) clearTimeout(copilotTimeoutRef.current);
        };
    }, []);

    const buildCopilotContext = (): DemoCopilotContext => ({
        scenario: activeScenario,
        trustFabricEnabled,
        shares,
        marketPrice,
        availableCash,
        articleTitle,
        articleBody,
        sqlQuery,
        patientNotes,
    });

    const handleCopilotSubmit = (text: string) => {
        if (!text.trim() || copilotThinking) return;
        const now = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        setChatMessages((prev) => [...prev, { sender: "user", text, timestamp: now }]);
        setCopilotInput("");
        setCopilotThinking(true);

        const result = evaluateDemoCopilotMessage(text, buildCopilotContext());

        copilotTimeoutRef.current = setTimeout(() => {
            setChatMessages((prev) => [...prev, ...result.messages]);
            if (result.openBlockedModal) setBlockedModalOpen(true);
            if (result.openExecutedModal) {
                if (selectedScenarioId === "robinhood") {
                    setAvailableCash((prev) => Math.max(0, prev - estimatedCost));
                    setOwnedShares((prev) => prev + shares);
                }
                setExecutedModalOpen(true);
            }
            setCopilotThinking(false);
        }, result.delayMs);
    };

    const suggestedPrompts = getSuggestedPrompts(selectedScenarioId);

    return (
        <div style={{ background: "#f8fafc", color: "#0f172a", minHeight: "100vh", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif" }}>
            {/* ── Top Floating Enterprise Governance Header ────────────────── */}
            <header style={{
                background: "#000000",
                color: "#ffffff",
                padding: "10px 24px",
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                position: "sticky",
                top: 0,
                zIndex: 1000,
                boxShadow: "0 4px 20px rgba(0,0,0,0.4)"
            }}>
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <SecurityOutlinedIcon sx={{ fontSize: 18, color: trustFabricEnabled ? "#10b981" : "#f43f5e" }} />
                    <div style={{ fontSize: 13, fontWeight: 700, display: "flex", alignItems: "center", gap: 8 }}>
                        <span>TrustFabric In-Line Proxy</span>
                        <span style={{
                            fontSize: 10,
                            fontWeight: 800,
                            padding: "2px 8px",
                            borderRadius: 12,
                            background: trustFabricEnabled ? "rgba(16, 185, 129, 0.12)" : "rgba(244, 63, 94, 0.12)",
                            color: trustFabricEnabled ? "#10b981" : "#f43f5e",
                            border: `1px solid ${trustFabricEnabled ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}`
                        }}>
                            {trustFabricEnabled ? "ACTIVE" : "OFF"}
                        </span>
                    </div>
                </div>

                {/* Minimal Scenario Switcher Dropdown */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <select
                        value={selectedScenarioId}
                        onChange={(e) => {
                            const nextScenario = SCENARIOS.find((s) => s.id === e.target.value);
                            setSelectedScenarioId(e.target.value as DemoScenarioId);
                            if (copilotTimeoutRef.current) clearTimeout(copilotTimeoutRef.current);
                            setCopilotThinking(false);
                            setChatMessages(nextScenario ? [getScenarioWelcomeMessage(nextScenario)] : []);
                        }}
                        style={{
                            background: "#18181b",
                            color: "#ffffff",
                            border: "1px solid rgba(255, 255, 255, 0.1)",
                            padding: "6px 12px",
                            borderRadius: 6,
                            fontSize: 12,
                            fontWeight: 600,
                            cursor: "pointer",
                            outline: "none"
                        }}
                    >
                        {SCENARIOS.map((s) => (
                            <option key={s.id} value={s.id}>
                                {s.title}
                            </option>
                        ))}
                    </select>

                    <button
                        type="button"
                        onClick={() => setTrustFabricEnabled(!trustFabricEnabled)}
                        style={{
                            background: trustFabricEnabled ? "rgba(16, 185, 129, 0.1)" : "rgba(244, 63, 94, 0.1)",
                            color: trustFabricEnabled ? "#10b981" : "#f43f5e",
                            border: `1px solid ${trustFabricEnabled ? "rgba(16, 185, 129, 0.25)" : "rgba(244, 63, 94, 0.25)"}`,
                            padding: "6px 12px",
                            borderRadius: 6,
                            fontWeight: 600,
                            fontSize: 12,
                            cursor: "pointer"
                        }}
                    >
                        {trustFabricEnabled ? "Firewall: ACTIVE" : "Enable Firewall"}
                    </button>

                    <Link
                        href="/audit"
                        target="_blank"
                        style={{ fontSize: 12, color: "#94a3b8", textDecoration: "none", display: "flex", alignItems: "center", gap: 4, fontWeight: 500 }}
                    >
                        Audit Trail ↗
                    </Link>
                </div>
            </header>

            {/* ── 1. ROBINHOOD FINANCIAL WEB UI (EXACT SCREENSHOT MATCH) ── */}
            {selectedScenarioId === "robinhood" && (
                <div style={{ background: "#ffffff", minHeight: "calc(100vh - 54px)" }}>
                    <nav style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "16px 48px",
                        borderBottom: "1px solid #e5e7eb"
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 32 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="#00c805"><path d="M12 3c-4.97 0-9 4.03-9 9 0 2.12.74 4.07 1.97 5.61L4.35 19.3c-.39.39-.39 1.02 0 1.41.39.39 1.02.39 1.41 0l1.69-1.69C9.02 20.26 10.97 21 13.09 21c4.97 0 9-4.03 9-9 0-4.97-4.03-9-9.09-9zm-1.09 13.5v-4.5h2v4.5h-2zm0-6.5V7h2v3h-2z"/></svg>
                                <span style={{ fontWeight: 800, fontSize: 18, letterSpacing: "-0.5px" }}>Robinhood</span>
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 10, background: "#f3f4f6", padding: "8px 16px", borderRadius: 8, width: 320 }}>
                                <SearchOutlinedIcon sx={{ fontSize: 16, color: "#9ca3af" }} />
                                <input placeholder="Search for stocks" defaultValue="Dunder Mifflin Inc" style={{ border: "none", background: "transparent", outline: "none", fontSize: 13, color: "#111827", width: "100%" }} />
                            </div>
                        </div>
                        <div style={{ display: "flex", gap: 28, fontSize: 13, fontWeight: 600, color: "#374151" }}>
                            <span style={{ color: "#111827" }}>Home</span><span>Notifications</span><span>Account</span>
                        </div>
                    </nav>

                    <main style={{ maxWidth: 1160, margin: "0 auto", padding: "40px 24px", display: "grid", gridTemplateColumns: "1fr 340px", gap: 48 }}>
                        <div>
                            <h1 style={{ fontSize: 36, fontWeight: 800, margin: "0 0 4px 0", letterSpacing: "-0.8px", color: "#111827" }}>Dunder Mifflin Inc</h1>
                            <div style={{ display: "flex", alignItems: "baseline", gap: 12, marginBottom: 8 }}>
                                <span style={{ fontSize: 36, fontWeight: 800, color: "#111827", letterSpacing: "-1px" }}>${marketPrice.toFixed(2)}</span>
                                <span style={{ fontSize: 14, fontWeight: 700, color: "#00c805" }}>+$7.07 (+0.70%) Today</span>
                            </div>

                            <div style={{ display: "flex", gap: 8, marginBottom: 24 }}>
                                <span style={{ background: "#f3f4f6", padding: "4px 10px", borderRadius: 16, fontSize: 11, fontWeight: 700, color: "#374151" }}>⚡ 77%</span>
                                <span style={{ background: "#f3f4f6", padding: "4px 10px", borderRadius: 16, fontSize: 11, fontWeight: 700, color: "#374151" }}>🔥 22k</span>
                            </div>

                            <div style={{ height: 220, width: "100%", margin: "20px 0" }}>
                                <svg width="100%" height="200" viewBox="0 0 600 200" preserveAspectRatio="none">
                                    <path d="M0 120 Q 60 160 120 140 T 240 80 T 360 90 T 480 70 T 600 50" fill="none" stroke="#00c805" strokeWidth="2.5" />
                                    <line x1="0" y1="140" x2="600" y2="140" stroke="#e5e7eb" strokeDasharray="3 3" />
                                </svg>
                            </div>

                            <div style={{ display: "flex", gap: 24, borderBottom: "1px solid #e5e7eb", paddingBottom: 12, marginBottom: 32 }}>
                                {["Today", "1W", "1M", "3M", "1Y", "5Y"].map((tf) => (
                                    <button key={tf} type="button" onClick={() => setTimeframe(tf)} style={{ border: "none", background: "transparent", fontSize: 13, fontWeight: 700, color: timeframe === tf ? "#00c805" : "#6b7280", borderBottom: timeframe === tf ? "2px solid #00c805" : "2px solid transparent", paddingBottom: 8, cursor: "pointer" }}>
                                        {tf}
                                    </button>
                                ))}
                            </div>

                            <div style={{ marginBottom: 40 }}>
                                <h3 style={{ fontSize: 20, fontWeight: 700, marginBottom: 12, color: "#111827" }}>About DMI</h3>
                                <p style={{ fontSize: 14, color: "#4b5563", lineHeight: 1.6, maxWidth: 640 }}>
                                    Dunder Mifflin Inc provides its customers quality office and information technology products, furniture, printing values, and the expertise required for making informed buying decisions...
                                </p>
                            </div>
                        </div>

                        {/* Order Widget Card */}
                        <div>
                            <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: 24, boxShadow: "0 10px 30px rgba(0,0,0,0.06)", background: "#ffffff", position: "sticky", top: 90 }}>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 800, margin: 0, color: "#111827" }}>Buy DMI</h3>
                                    <span style={{ color: "#9ca3af", fontWeight: "bold" }}>•••</span>
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                                    <label style={{ fontSize: 13, color: "#4b5563" }}>Shares</label>
                                    <input type="number" min={1} value={shares} onChange={(e) => setShares(Math.max(1, parseInt(e.target.value) || 1))} style={{ width: 80, textAlign: "right", padding: "8px 12px", borderRadius: 6, border: "1px solid #e5e7eb", background: "#f9fafb", fontSize: 14, fontWeight: 700 }} />
                                </div>
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16, fontSize: 13 }}>
                                    <span style={{ color: "#4b5563" }}>Market price</span>
                                    <span style={{ fontWeight: 700 }}>${marketPrice.toFixed(2)}</span>
                                </div>
                                <div style={{ borderTop: "1px dashed #e5e7eb", margin: "16px 0" }} />
                                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24, fontSize: 14 }}>
                                    <span style={{ fontWeight: 700 }}>Estimated cost</span>
                                    <span style={{ fontWeight: 800, fontSize: 16 }}>${estimatedCost.toLocaleString("en-US", { minimumFractionDigits: 2 })}</span>
                                </div>
                                <button type="button" disabled={isSubmitting} onClick={handleActionExecute} style={{ width: "100%", background: "#00c805", color: "#ffffff", border: "none", padding: 14, borderRadius: 24, fontSize: 13, fontWeight: 800, letterSpacing: "0.05em", textTransform: "uppercase", cursor: "pointer" }}>
                                    {isSubmitting ? "Submitting Order…" : "REVIEW ORDER"}
                                </button>
                                <div style={{ textAlign: "center", marginTop: 16, fontSize: 12, color: "#6b7280" }}>
                                    ${availableCash.toLocaleString("en-US", { minimumFractionDigits: 2 })} available
                                </div>
                            </div>
                        </div>
                    </main>
                </div>
            )}

            {/* ── 2. AUTHENTIC SUBSTACK CREATOR PORTAL ────────────────────── */}
            {selectedScenarioId === "substack" && (
                <div style={{ background: "#ffffff", minHeight: "calc(100vh - 54px)" }}>
                    <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "16px 48px", borderBottom: "1px solid #e5e7eb" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <div style={{ width: 28, height: 28, background: "#ff6719", borderRadius: 4, display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 900, fontSize: 16 }}>S</div>
                            <span style={{ fontWeight: 800, fontSize: 18, fontFamily: "Georgia, serif" }}>Substack Publisher</span>
                        </div>
                        <div style={{ display: "flex", gap: 24, fontSize: 13, fontWeight: 600, color: "#4b5563" }}>
                            <span style={{ color: "#ff6719" }}>Posts</span><span>Subscribers (50,000)</span><span>Stats</span><span>Settings</span>
                        </div>
                    </nav>

                    <main style={{ maxWidth: 840, margin: "0 auto", padding: "48px 24px" }}>
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 24 }}>
                            <span style={{ fontSize: 12, color: "#6b7280", textTransform: "uppercase", letterSpacing: "0.05em", fontWeight: 700 }}>Draft Post · AI Macro Assistant</span>
                            <span style={{ fontSize: 12, color: "#ff6719", fontWeight: 700 }}>Audience: 50,000 Paid Subscribers</span>
                        </div>

                        <input
                            value={articleTitle}
                            onChange={(e) => setArticleTitle(e.target.value)}
                            placeholder="Enter post title..."
                            style={{ width: "100%", fontSize: 32, fontWeight: 800, fontFamily: "Georgia, serif", border: "none", outline: "none", marginBottom: 20, color: "#111827" }}
                        />

                        <textarea
                            value={articleBody}
                            onChange={(e) => setArticleBody(e.target.value)}
                            rows={8}
                            style={{ width: "100%", fontSize: 16, fontFamily: "Georgia, serif", lineHeight: 1.7, border: "none", outline: "none", resize: "vertical", color: "#374151", marginBottom: 32 }}
                        />

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid #e5e7eb", paddingTop: 24 }}>
                            <span style={{ fontSize: 12, color: "#6b7280" }}>Automated release workflow triggers broadcast to 50k emails</span>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={handleActionExecute}
                                style={{ background: "#ff6719", color: "#fff", border: "none", padding: "12px 28px", borderRadius: 24, fontWeight: 700, fontSize: 14, cursor: "pointer" }}
                            >
                                {isSubmitting ? "Publishing…" : "PUBLISH POST TO ALL SUBSCRIBERS"}
                            </button>
                        </div>
                    </main>
                </div>
            )}

            {/* ── 3. AUTHENTIC SUPABASE SQL EDITOR (EXACT SCREENSHOT MATCH) ── */}
            {selectedScenarioId === "postgres" && (
                <div style={{ background: "#121212", color: "#ededed", minHeight: "calc(100vh - 54px)", fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
                    {/* Top Supabase Navbar */}
                    <nav style={{
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        padding: "10px 16px",
                        background: "#171717",
                        borderBottom: "1px solid #262626",
                        fontSize: 12
                    }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            {/* Supabase Emerald Logo */}
                            <div style={{ color: "#3ecf8e", fontWeight: 900, fontSize: 16 }}>⚡</div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#a1a1a1" }}>
                                <span style={{ color: "#ededed", fontWeight: 600 }}>Desmosy&apos;s Org</span>
                                <span style={{ background: "#262626", color: "#a1a1a1", padding: "1px 6px", borderRadius: 4, fontSize: 10 }}>FREE</span>
                                <span>/</span>
                                <span style={{ color: "#ededed", fontWeight: 600 }}>accredai</span>
                                <span>/</span>
                                <span style={{ color: "#ededed", fontWeight: 600 }}>main</span>
                                <span style={{ background: "#422006", color: "#f97316", padding: "1px 6px", borderRadius: 4, fontSize: 10, fontWeight: 700 }}>PRODUCTION</span>
                            </div>
                            <div style={{ background: "#262626", padding: "3px 10px", borderRadius: 14, fontSize: 11, color: "#ededed", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                                ⚡ Connect
                            </div>
                        </div>

                        <div style={{ display: "flex", alignItems: "center", gap: 16, color: "#a1a1a1" }}>
                            <span>Feedback</span>
                            <div style={{ background: "#262626", padding: "4px 10px", borderRadius: 6, display: "flex", alignItems: "center", gap: 8, width: 140 }}>
                                <span>🔍 Search...</span>
                                <span style={{ fontSize: 10, background: "#171717", padding: "1px 4px", borderRadius: 4 }}>⌘K</span>
                            </div>
                            <span>❓</span><span>💡</span><span>🔔</span>
                            <div style={{ width: 24, height: 24, borderRadius: "50%", background: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center", color: "#000", fontWeight: 700, fontSize: 11 }}>D</div>
                        </div>
                    </nav>

                    {/* Main Workspace Layout */}
                    <div style={{ display: "grid", gridTemplateColumns: "48px 240px 1fr", minHeight: "calc(100vh - 98px)" }}>
                        {/* 1. Icon Sidebar */}
                        <div style={{ background: "#121212", borderRight: "1px solid #262626", display: "flex", flexDirection: "column", alignItems: "center", padding: "16px 0", gap: 20, color: "#a1a1a1" }}>
                            <span style={{ cursor: "pointer" }}>🏠</span>
                            <span style={{ cursor: "pointer" }}>🗄️</span>
                            <span style={{ cursor: "pointer", color: "#3ecf8e", background: "#171717", padding: 8, borderRadius: 6 }}>⚡</span>
                            <span style={{ cursor: "pointer" }}>📄</span>
                            <span style={{ cursor: "pointer" }}>🔐</span>
                            <span style={{ cursor: "pointer" }}>📦</span>
                            <span style={{ cursor: "pointer" }}>🚀</span>
                            <span style={{ cursor: "pointer" }}>📊</span>
                            <span style={{ cursor: "pointer" }}>⚙️</span>
                        </div>

                        {/* 2. SQL Queries List Sidebar */}
                        <div style={{ background: "#171717", borderRight: "1px solid #262626", padding: 16 }}>
                            <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: "#ededed" }}>
                                SQL Editor
                            </div>
                            <div style={{ display: "flex", gap: 6, marginBottom: 16 }}>
                                <div style={{ flex: 1, background: "#262626", padding: "6px 10px", borderRadius: 6, fontSize: 11, color: "#a1a1a1" }}>
                                    🔍 Search queries...
                                </div>
                                <button type="button" style={{ background: "#262626", border: "none", color: "#fff", padding: "0 8px", borderRadius: 6, cursor: "pointer" }}>+</button>
                            </div>

                            <div style={{ fontSize: 11, fontWeight: 700, color: "#737373", marginTop: 12, marginBottom: 6 }}>&gt; SHARED</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#737373", marginTop: 12, marginBottom: 6 }}>&gt; FAVORITES</div>
                            <div style={{ fontSize: 11, fontWeight: 700, color: "#737373", marginTop: 12, marginBottom: 6 }}>∨ PRIVATE (16)</div>

                            <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                                <div style={{ background: "#262626", color: "#ededed", padding: "6px 10px", borderRadius: 6, fontWeight: 600, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                    <span style={{ fontSize: 10, background: "#171717", padding: "1px 4px", borderRadius: 2 }}>SQL</span>
                                    <span>Untitled query</span>
                                </div>
                                {["Untitled query", "Untitled query", "Accreditation Standard...", "Vault Folder Structure..."].map((q, idx) => (
                                    <div key={idx} style={{ color: "#a1a1a1", padding: "6px 10px", borderRadius: 6, display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }}>
                                        <span style={{ fontSize: 10, background: "#262626", padding: "1px 4px", borderRadius: 2 }}>SQL</span>
                                        <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{q}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* 3. Main Query Code Editor Area */}
                        <div style={{ display: "flex", flexDirection: "column", background: "#171717" }}>
                            {/* Editor Tabs */}
                            <div style={{ display: "flex", alignItems: "center", background: "#121212", borderBottom: "1px solid #262626", padding: "0 12px" }}>
                                <div style={{ background: "#171717", color: "#ededed", padding: "8px 16px", borderTop: "2px solid #3ecf8e", fontSize: 12, fontWeight: 600, display: "flex", alignItems: "center", gap: 8 }}>
                                    <span>📄 Untitled query</span>
                                </div>
                                <span style={{ color: "#737373", padding: "0 12px", cursor: "pointer" }}>+</span>
                            </div>

                            {/* Toolbar */}
                            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #262626", fontSize: 11, color: "#a1a1a1" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                                    <span>Autosave enabled</span> <span>✂</span>
                                </div>
                                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                                    <span>Source: <strong style={{ color: "#ededed" }}>Primary Database ˆ</strong></span>
                                    <span>Role: <strong style={{ color: "#ededed" }}>postgres ˆ</strong></span>
                                    <span>Limit: <strong style={{ color: "#ededed" }}>100 rows ˆ</strong></span>

                                    {/* Supabase Run Button */}
                                    <button
                                        type="button"
                                        disabled={isSubmitting}
                                        onClick={handleActionExecute}
                                        style={{
                                            background: "#3ecf8e",
                                            color: "#000000",
                                            border: "none",
                                            padding: "6px 14px",
                                            borderRadius: 6,
                                            fontWeight: 800,
                                            fontSize: 12,
                                            cursor: "pointer",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: 6
                                        }}
                                    >
                                        {isSubmitting ? "Running Query…" : "Run ⌘↵"}
                                    </button>
                                </div>
                            </div>

                            {/* Monaco-Style Code Editor Window */}
                            <div style={{ flex: 1, padding: 16, background: "#171717", display: "grid", gridTemplateColumns: "30px 1fr", gap: 12, fontFamily: "monospace", fontSize: 13, lineHeight: 1.7 }}>
                                <div style={{ color: "#525252", textAlign: "right", userSelect: "none" }}>
                                    1<br />2<br />3<br />4<br />5<br />6<br />7<br />8<br />9
                                </div>
                                <div>
                                    <span style={{ color: "#38bdf8", fontWeight: 700 }}>UPDATE</span> fleet_schedules<br />
                                    &nbsp;&nbsp;<span style={{ color: "#38bdf8", fontWeight: 700 }}>SET</span> dispatch_status = <span style={{ color: "#10b981" }}>&apos;CANCELLED&apos;</span><br />
                                    <span style={{ color: "#38bdf8", fontWeight: 700 }}>WHERE</span> location = <span style={{ color: "#10b981" }}>&apos;Permian Basin&apos;</span>;<br />
                                </div>
                            </div>

                            {/* Results Pane */}
                            <div style={{ height: 160, borderTop: "1px solid #262626", background: "#121212", padding: 16 }}>
                                <div style={{ display: "flex", gap: 16, fontSize: 12, color: "#a1a1a1", borderBottom: "1px solid #262626", paddingBottom: 8, marginBottom: 12 }}>
                                    <span style={{ color: "#3ecf8e", fontWeight: 700, borderBottom: "2px solid #3ecf8e", paddingBottom: 6 }}>Results</span>
                                    <span>Chart</span>
                                </div>
                                <div style={{ fontSize: 12, color: "#737373" }}>
                                    Click <strong style={{ color: "#ededed" }}>Run</strong> to execute your query
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── 4. AUTHENTIC EPIC HYPERSPACE EMR HEALTHCARE PORTAL ───────── */}
            {selectedScenarioId === "healthcare" && (
                <div style={{ background: "#f8fafc", minHeight: "calc(100vh - 54px)" }}>
                    <nav style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "14px 32px", background: "#0f172a", color: "#fff" }}>
                        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                            <span style={{ background: "#0284c7", color: "#fff", padding: "2px 8px", borderRadius: 4, fontWeight: 900, fontSize: 12 }}>EPIC EMR</span>
                            <span style={{ fontSize: 14, fontWeight: 700 }}>Apex Health System — Hyperspace Clinical Module</span>
                        </div>
                        <span style={{ fontSize: 12, color: "#94a3b8" }}>Encrypted HIPAA Zone · Provider ID: #49102</span>
                    </nav>

                    {/* Patient Header Banner */}
                    <div style={{ background: "#0284c7", color: "#fff", padding: "16px 32px", display: "flex", gap: 32, fontSize: 13 }}>
                        <div><strong>Patient:</strong> Johnathan Miller</div>
                        <div><strong>MRN:</strong> #8941092</div>
                        <div><strong>DOB:</strong> 04/12/1982 (Age 44)</div>
                        <div><strong>Sex:</strong> Male</div>
                        <div><strong>Allergies:</strong> Penicillin</div>
                    </div>

                    <main style={{ maxWidth: 960, margin: "0 auto", padding: "40px 24px" }}>
                        <div style={{ border: "1px solid #cbd5e1", borderRadius: 8, background: "#ffffff", padding: 24, marginBottom: 24, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" }}>
                            <h3 style={{ fontSize: 16, fontWeight: 700, marginBottom: 12, color: "#0f172a" }}>Clinical Progress Note & SSN Payload</h3>
                            <textarea
                                value={patientNotes}
                                onChange={(e) => setPatientNotes(e.target.value)}
                                rows={4}
                                style={{ width: "100%", padding: 12, borderRadius: 6, border: "1px solid #cbd5e1", fontSize: 13, lineHeight: 1.6, color: "#334155" }}
                            />
                        </div>

                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 12, color: "#64748b" }}>Transmitting payload to external OpenAI LLM context model</span>
                            <button
                                type="button"
                                disabled={isSubmitting}
                                onClick={handleActionExecute}
                                style={{ background: "#0284c7", color: "#fff", border: "none", padding: "12px 24px", borderRadius: 6, fontWeight: 700, fontSize: 13, cursor: "pointer" }}
                            >
                                {isSubmitting ? "Transmitting Record…" : "TRANSMIT CLINICAL RECORD TO LLM"}
                            </button>
                        </div>
                    </main>
                </div>
            )}

            {/* ── FLOATING AI ASSISTANT DRAWER ────────────────────────────────── */}
            <div style={{ position: "fixed", bottom: 24, right: 24, zIndex: 900 }}>
                {!copilotOpen ? (
                    <button
                        type="button"
                        onClick={() => setCopilotOpen(true)}
                        style={{
                            background: "#0f172a",
                            color: "#ffffff",
                            border: "none",
                            padding: "12px 20px",
                            borderRadius: 30,
                            fontWeight: 700,
                            fontSize: 13,
                            boxShadow: "0 8px 24px rgba(0,0,0,0.3)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: 8
                        }}
                    >
                        <SmartToyOutlinedIcon sx={{ fontSize: 16 }} /> Test AI Assistant Action
                    </button>
                ) : (
                    <div style={{
                        width: 380,
                        height: 520,
                        background: "#0f172a",
                        color: "#fff",
                        borderRadius: 16,
                        boxShadow: "0 16px 40px rgba(0,0,0,0.5)",
                        display: "flex",
                        flexDirection: "column",
                        overflow: "hidden",
                        border: "1px solid #334155"
                    }}>
                        <div style={{ padding: "14px 16px", background: "#1e293b", display: "flex", justifyContent: "space-between", alignItems: "center", borderBottom: "1px solid #334155" }}>
                            <div style={{ color: "#fff", fontWeight: 700, fontSize: 13, display: "flex", alignItems: "center", gap: 6 }}>
                                <SmartToyOutlinedIcon sx={{ fontSize: 16, color: "#34d399" }} /> AI Agent Copilot
                                {trustFabricEnabled && <span style={{ background: "#00c805", color: "#000", fontSize: 10, padding: "2px 6px", borderRadius: 10, fontWeight: 800, marginLeft: 8 }}>PROTECTED</span>}
                            </div>
                            <button type="button" onClick={() => setCopilotOpen(false)} style={{ background: "none", border: "none", color: "#94a3b8", cursor: "pointer", fontWeight: "bold" }}>✕</button>
                        </div>

                        <div style={{ flex: 1, padding: 14, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                            {chatMessages.map((m, i) => (
                                <div key={i} style={{
                                    alignSelf: m.sender === "user" ? "flex-end" : "flex-start",
                                    maxWidth: "85%",
                                    padding: "10px 14px",
                                    borderRadius: 12,
                                    background: m.sender === "user" ? "#00c805" : m.blocked ? "rgba(239, 68, 68, 0.2)" : "#334155",
                                    color: m.sender === "user" ? "#000" : "#fff",
                                    fontSize: 12,
                                    whiteSpace: "pre-line"
                                }}>
                                    {m.text}
                                </div>
                            ))}
                            {copilotThinking && (
                                <div style={{
                                    alignSelf: "flex-start",
                                    maxWidth: "85%",
                                    padding: "10px 14px",
                                    borderRadius: 12,
                                    background: "#334155",
                                    color: "#94a3b8",
                                    fontSize: 12,
                                    fontStyle: "italic",
                                }}>
                                    Evaluating request against {activeScenario.ruleId}…
                                </div>
                            )}
                        </div>

                        <div style={{ padding: "8px 12px 0", background: "#1e293b", display: "flex", flexWrap: "wrap", gap: 6 }}>
                            {suggestedPrompts.map((prompt) => (
                                <button
                                    key={prompt}
                                    type="button"
                                    disabled={copilotThinking}
                                    onClick={() => handleCopilotSubmit(prompt)}
                                    style={{
                                        background: "#0f172a",
                                        color: "#cbd5e1",
                                        border: "1px solid #334155",
                                        padding: "4px 8px",
                                        borderRadius: 999,
                                        fontSize: 10,
                                        cursor: copilotThinking ? "not-allowed" : "pointer",
                                        opacity: copilotThinking ? 0.6 : 1,
                                    }}
                                >
                                    {prompt}
                                </button>
                            ))}
                        </div>

                        <form onSubmit={(e) => { e.preventDefault(); handleCopilotSubmit(copilotInput); }} style={{ padding: 12, background: "#1e293b", display: "flex", gap: 8 }}>
                            <input
                                placeholder={`Ask AI on ${activeScenario.vendorName}...`}
                                value={copilotInput}
                                onChange={(e) => setCopilotInput(e.target.value)}
                                style={{ flex: 1, background: "#0f172a", border: "1px solid #334155", color: "#fff", padding: "8px 12px", borderRadius: 8, fontSize: 12, outline: "none" }}
                            />
                            <button type="submit" disabled={copilotThinking} style={{ background: "#00c805", color: "#000", border: "none", padding: "8px 14px", borderRadius: 8, fontWeight: 700, fontSize: 12, cursor: copilotThinking ? "not-allowed" : "pointer", opacity: copilotThinking ? 0.6 : 1 }}>Send</button>
                        </form>
                    </div>
                )}
            </div>

            {/* ── MODAL A: BLOCKED BY TRUSTFABRIC GOVERNANCE (HTTP 403) ── */}
            {blockedModalOpen && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0, 0, 0, 0.75)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2000,
                    padding: 24,
                    backdropFilter: "blur(4px)"
                }}>
                    <div style={{
                        background: "#121214",
                        color: "#ffffff",
                        borderRadius: 12,
                        maxWidth: 480,
                        width: "100%",
                        padding: 28,
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        boxShadow: "0 20px 40px rgba(0, 0, 0, 0.6)"
                    }}>
                        <div style={{ display: "flex", alignItems: "flex-start", gap: 14, marginBottom: 20 }}>
                            <div style={{
                                background: "rgba(244, 63, 94, 0.12)",
                                color: "#fb7185",
                                border: "1px solid rgba(244, 63, 94, 0.25)",
                                width: 36,
                                height: 36,
                                borderRadius: 8,
                                display: "flex",
                                alignItems: "center",
                                justifyContent: "center",
                                flexShrink: 0
                            }}>
                                <CancelOutlinedIcon sx={{ fontSize: 20, color: "#fb7185" }} />
                            </div>
                            <div>
                                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 2 }}>
                                    <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0, color: "#ffffff" }}>
                                        HTTP 403 Forbidden
                                    </h3>
                                    <span style={{ fontSize: 10, fontWeight: 800, background: "rgba(244, 63, 94, 0.15)", color: "#fb7185", padding: "1px 6px", borderRadius: 4 }}>
                                        INTERCEPTED BY PROXY
                                    </span>
                                </div>
                                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                                    In-Line Interception Gateway · Latency 1.8ms
                                </div>
                            </div>
                        </div>

                        <div style={{ background: "#18181b", padding: 16, borderRadius: 8, marginBottom: 20, fontSize: 13, lineHeight: 1.6, border: "1px solid rgba(255, 255, 255, 0.06)" }}>
                            <div style={{ fontWeight: 600, color: "#f8fafc", marginBottom: 4 }}>
                                Policy Rule Enforced: {activeScenario.ruleName}
                            </div>
                            <div style={{ fontSize: 11, fontFamily: "monospace", color: "#94a3b8", marginBottom: 8 }}>
                                Policy ID: {activeScenario.ruleId} · Vendor: {activeScenario.vendorName}
                            </div>
                            <div style={{ color: "#cbd5e1", fontSize: 12 }}>
                                {activeScenario.ruleDesc}
                            </div>
                        </div>

                        <div style={{ fontSize: 12, color: "#34d399", marginBottom: 24, fontWeight: 600, display: "flex", alignItems: "center", gap: 6 }}>
                            <span>✓</span> 0 data or funds leaked. Request killed at proxy layer.
                        </div>

                        <div style={{ display: "flex", gap: 12 }}>
                            <button
                                type="button"
                                onClick={() => setBlockedModalOpen(false)}
                                style={{
                                    flex: 1,
                                    background: "#ffffff",
                                    color: "#0c0c0e",
                                    border: "none",
                                    padding: "10px 16px",
                                    borderRadius: 6,
                                    fontWeight: 700,
                                    fontSize: 13,
                                    cursor: "pointer"
                                }}
                            >
                                Acknowledge & Dismiss
                            </button>
                            <Link
                                href="/audit"
                                target="_blank"
                                style={{
                                    padding: "10px 16px",
                                    borderRadius: 6,
                                    border: "1px solid rgba(255, 255, 255, 0.15)",
                                    background: "#18181b",
                                    color: "#ffffff",
                                    textDecoration: "none",
                                    fontSize: 13,
                                    fontWeight: 600,
                                    display: "flex",
                                    alignItems: "center",
                                    gap: 4
                                }}
                            >
                                Audit Stream ↗
                            </Link>
                        </div>
                    </div>
                </div>
            )}

            {/* ── MODAL B: REAL VENDOR ORDER / ACTION PLACED (FIREWALL DISABLED) ── */}
            {executedModalOpen && (
                <div style={{
                    position: "fixed",
                    inset: 0,
                    background: "rgba(0,0,0,0.65)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    zIndex: 2000,
                    padding: 24
                }}>
                    <div style={{
                        background: "#ffffff",
                        color: "#111827",
                        borderRadius: 16,
                        maxWidth: 440,
                        width: "100%",
                        padding: 32,
                        textAlign: "center",
                        boxShadow: "0 24px 48px rgba(0,0,0,0.2)"
                    }}>
                        <div style={{
                            width: 64,
                            height: 64,
                            borderRadius: "50%",
                            background: "#ecfdf5",
                            color: "#00c805",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontSize: 32,
                            fontWeight: "bold",
                            margin: "0 auto 16px auto"
                        }}>
                            ✓
                        </div>

                        <h3 style={{ fontSize: 22, fontWeight: 800, margin: "0 0 6px 0", color: "#111827" }}>
                            Action Completed!
                        </h3>
                        <div style={{ fontSize: 13, color: "#6b7280", marginBottom: 24 }}>
                            Direct Execution on {activeScenario.vendorName} API
                        </div>

                        <div style={{ background: "#f9fafb", padding: 16, borderRadius: 12, marginBottom: 24, textAlign: "left", fontSize: 13, display: "flex", flexDirection: "column", gap: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "#6b7280" }}>Vendor System</span>
                                <span style={{ fontWeight: 700, color: "#111827" }}>{activeScenario.vendorName}</span>
                            </div>
                            <div style={{ display: "flex", justifyContent: "space-between" }}>
                                <span style={{ color: "#6b7280" }}>Executed Action</span>
                                <span style={{ fontWeight: 700, color: "#111827" }}>{activeScenario.actionLabel}</span>
                            </div>
                        </div>

                        <button
                            type="button"
                            onClick={() => setExecutedModalOpen(false)}
                            style={{
                                width: "100%",
                                background: "#00c805",
                                color: "#ffffff",
                                border: "none",
                                padding: "14px",
                                borderRadius: 24,
                                fontWeight: 800,
                                fontSize: 14,
                                cursor: "pointer",
                                letterSpacing: "0.05em"
                            }}
                        >
                            DONE
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
