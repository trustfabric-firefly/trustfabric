"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import GitHubIcon from "@mui/icons-material/GitHub";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import LinkOffOutlinedIcon from "@mui/icons-material/LinkOffOutlined";
import AutoAwesomeOutlinedIcon from "@mui/icons-material/AutoAwesomeOutlined";
import BusinessOutlinedIcon from "@mui/icons-material/BusinessOutlined";
import NotificationsOutlinedIcon from "@mui/icons-material/NotificationsOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import InfoOutlinedIcon from "@mui/icons-material/InfoOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import SendOutlinedIcon from "@mui/icons-material/SendOutlined";
import TagOutlinedIcon from "@mui/icons-material/TagOutlined";
import CloudOutlinedIcon from "@mui/icons-material/CloudOutlined";
import { TopBar } from "@/components/layout/TopBar";
import { useAuth } from "@/providers/AuthProvider";
import { RESOLVED_API_BASE_URL, integrationsApi, settingsApi } from "@/lib/api";
import type { SlackChannel, AwsIntegrationStatus } from "@/types";
import { isFirebaseConfigured } from "@/lib/firebase";

// ─── Local storage keys ────────────────────────────────────────────────────────
const LS_ORG_NAME = "tf_org_name";
const LS_ORG_CONTACT = "tf_org_contact";
const LS_DEFAULT_GITHUB_ORG = "tf_default_github_org";
const LS_NOTIF_VIOLATIONS = "tf_notif_violations";
const LS_NOTIF_SCANS = "tf_notif_scans";
const LS_NOTIF_POLICY_CHANGES = "tf_notif_policy_changes";

function ls(key: string, fallback = "") {
    if (typeof window === "undefined") return fallback;
    return localStorage.getItem(key) ?? fallback;
}

// ─── Small presentational components ──────────────────────────────────────────

function SectionCard({ children }: { children: React.ReactNode }) {
    return (
        <section style={{
            padding: "var(--s-5)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--c-border)",
            background: "var(--c-surface-elevated)",
        }}>
            {children}
        </section>
    );
}

function SectionHeader({ icon, title, subtitle, badge }: {
    icon: React.ReactNode;
    title: string;
    subtitle?: string;
    badge?: React.ReactNode;
}) {
    return (
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", marginBottom: "var(--s-4)" }}>
            <div style={{ color: "var(--c-text-muted)", display: "flex" }}>{icon}</div>
            <div style={{ flex: 1 }}>
                <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-15)" }}>{title}</div>
                {subtitle && (
                    <div style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-12)", marginTop: 2 }}>{subtitle}</div>
                )}
            </div>
            {badge}
        </div>
    );
}

function SettingRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div style={{ marginBottom: "var(--s-3)" }}>
            <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</div>
            <div style={{ fontSize: "var(--fs-13)", wordBreak: "break-all", fontFamily: mono ? "ui-monospace, monospace" : undefined }}>
                {value}
            </div>
        </div>
    );
}

function StatusPill({ ok, labelOk, labelNo }: { ok: boolean; labelOk: string; labelNo: string }) {
    return (
        <span
            className={`badge ${ok ? "badge--live" : "badge--neutral"}`}
            style={{ fontSize: "var(--fs-11)" }}
        >
            {ok ? labelOk : labelNo}
        </span>
    );
}

function Divider() {
    return <div style={{ borderTop: "1px solid var(--c-border)", margin: "var(--s-4) 0" }} />;
}

function NotifToggle({ label, description, value, onChange }: {
    label: string;
    description: string;
    value: boolean;
    onChange: (v: boolean) => void;
}) {
    return (
        <div style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-4)", marginBottom: "var(--s-4)" }}>
            <div style={{ flex: 1 }}>
                <div style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-medium)" }}>{label}</div>
                <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: 2 }}>{description}</div>
            </div>
            <button
                type="button"
                role="switch"
                aria-checked={value}
                onClick={() => onChange(!value)}
                style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    border: "none",
                    cursor: "pointer",
                    background: value ? "var(--c-accent)" : "var(--c-border)",
                    position: "relative",
                    flexShrink: 0,
                    transition: "background 0.15s",
                }}
            >
                <span style={{
                    position: "absolute",
                    top: 3,
                    left: value ? 21 : 3,
                    width: 16,
                    height: 16,
                    borderRadius: "50%",
                    background: "white",
                    transition: "left 0.15s",
                }} />
            </button>
        </div>
    );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export default function SettingsPage() {
    const { user, isDevMode, logOut, loading } = useAuth();
    const [copied, setCopied] = useState(false);
    const searchParams = useSearchParams();
    const queryClient = useQueryClient();

    // GitHub OAuth redirect notice
    const githubParam = searchParams.get("github");
    const [githubNotice, setGithubNotice] = useState<"connected" | "error" | null>(
        githubParam === "connected" ? "connected" : githubParam === "error" ? "error" : null
    );
    useEffect(() => {
        if (githubParam === "connected") {
            void queryClient.invalidateQueries({ queryKey: ["github-status"] });
        }
    }, [githubParam, queryClient]);

    // Slack OAuth redirect notice
    const slackParam = searchParams.get("slack");
    const [slackNotice, setSlackNotice] = useState<"connected" | "error" | null>(
        slackParam === "connected" ? "connected" : slackParam === "error" ? "error" : null
    );
    useEffect(() => {
        if (slackParam === "connected") {
            void queryClient.invalidateQueries({ queryKey: ["slack-status"] });
        }
    }, [slackParam, queryClient]);

    // Remote data
    const { data: githubStatus, isLoading: githubLoading, refetch: refetchGitHub } = useQuery({
        queryKey: ["github-status"],
        queryFn: integrationsApi.getGitHubStatus,
        retry: false,
    });
    const { data: slackStatus, isLoading: slackLoading, refetch: refetchSlack } = useQuery({
        queryKey: ["slack-status"],
        queryFn: integrationsApi.getSlackStatus,
        retry: false,
    });
    const { data: awsStatus, isLoading: awsLoading, refetch: refetchAws } = useQuery({
        queryKey: ["aws-status"],
        queryFn: integrationsApi.getAwsStatus,
        retry: false,
    });
    const { data: backendStatus, isLoading: statusLoading } = useQuery({
        queryKey: ["settings-status"],
        queryFn: settingsApi.status,
        retry: false,
    });

    // Org profile (localStorage)
    const [orgName, setOrgName] = useState(() => ls(LS_ORG_NAME));
    const [orgContact, setOrgContact] = useState(() => ls(LS_ORG_CONTACT));
    const [orgSaved, setOrgSaved] = useState(false);
    const saveOrg = () => {
        localStorage.setItem(LS_ORG_NAME, orgName);
        localStorage.setItem(LS_ORG_CONTACT, orgContact);
        setOrgSaved(true);
        setTimeout(() => setOrgSaved(false), 2000);
    };

    // Scan defaults (localStorage)
    const [defaultGithubOrg, setDefaultGithubOrg] = useState(() => ls(LS_DEFAULT_GITHUB_ORG));
    const [scanDefaultsSaved, setScanDefaultsSaved] = useState(false);
    const saveScanDefaults = () => {
        localStorage.setItem(LS_DEFAULT_GITHUB_ORG, defaultGithubOrg);
        setScanDefaultsSaved(true);
        setTimeout(() => setScanDefaultsSaved(false), 2000);
    };

    // Notification preferences (localStorage)
    const [notifViolations, setNotifViolations] = useState(() => ls(LS_NOTIF_VIOLATIONS, "true") === "true");
    const [notifScans, setNotifScans] = useState(() => ls(LS_NOTIF_SCANS, "true") === "true");
    const [notifPolicyChanges, setNotifPolicyChanges] = useState(() => ls(LS_NOTIF_POLICY_CHANGES, "false") === "true");
    const saveNotif = (key: string, val: boolean) => localStorage.setItem(key, String(val));

    // GitHub actions
    const connectGitHub = async () => {
        try {
            const { url } = await integrationsApi.getGitHubConnectUrl();
            window.location.href = url;
        } catch {
            setGithubNotice("error");
        }
    };
    const disconnectGitHub = async () => {
        try {
            await integrationsApi.disconnectGitHub();
            await refetchGitHub();
            setGithubNotice(null);
        } catch { /* ignore */ }
    };

    // Slack actions
    const [slackChannels, setSlackChannels] = useState<SlackChannel[]>([]);
    const [slackChannelsLoading, setSlackChannelsLoading] = useState(false);
    const [slackTestSending, setSlackTestSending] = useState(false);
    const [slackTestResult, setSlackTestResult] = useState<"ok" | "error" | null>(null);

    const connectSlack = async () => {
        try {
            const { url } = await integrationsApi.getSlackConnectUrl();
            window.location.href = url;
        } catch {
            setSlackNotice("error");
        }
    };
    const disconnectSlack = async () => {
        try {
            await integrationsApi.disconnectSlack();
            await refetchSlack();
            setSlackNotice(null);
        } catch { /* ignore */ }
    };
    const loadSlackChannels = async () => {
        setSlackChannelsLoading(true);
        try {
            const channels = await integrationsApi.getSlackChannels();
            setSlackChannels(channels);
        } catch { /* ignore */ }
        setSlackChannelsLoading(false);
    };
    const changeSlackChannel = async (channelId: string) => {
        const ch = slackChannels.find(c => c.id === channelId);
        if (!ch) return;
        try {
            await integrationsApi.updateSlackChannel(ch.id, ch.name);
            await refetchSlack();
        } catch { /* ignore */ }
    };
    const testSlack = async () => {
        setSlackTestSending(true);
        setSlackTestResult(null);
        try {
            await integrationsApi.testSlack();
            setSlackTestResult("ok");
        } catch {
            setSlackTestResult("error");
        }
        setSlackTestSending(false);
        setTimeout(() => setSlackTestResult(null), 3000);
    };

    useEffect(() => {
        if (slackStatus?.connected) void loadSlackChannels();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [slackStatus?.connected]);

    // AWS actions
    const [awsRoleArn, setAwsRoleArn] = useState("");
    const [awsRegion, setAwsRegion] = useState("us-east-1");
    const [awsConnecting, setAwsConnecting] = useState(false);
    const [awsError, setAwsError] = useState<string | null>(null);
    const [awsTestResult, setAwsTestResult] = useState<"ok" | "error" | null>(null);
    const [awsTesting, setAwsTesting] = useState(false);

    const connectAws = async () => {
        setAwsConnecting(true);
        setAwsError(null);
        try {
            await integrationsApi.connectAws(awsRoleArn, awsRegion);
            await refetchAws();
            setAwsRoleArn("");
        } catch (err: any) {
            setAwsError(err?.message || "Failed to connect");
        }
        setAwsConnecting(false);
    };
    const disconnectAws = async () => {
        try {
            await integrationsApi.disconnectAws();
            await refetchAws();
        } catch { /* ignore */ }
    };
    const testAws = async () => {
        setAwsTesting(true);
        setAwsTestResult(null);
        try {
            await integrationsApi.testAws();
            setAwsTestResult("ok");
        } catch {
            setAwsTestResult("error");
        }
        setAwsTesting(false);
        setTimeout(() => setAwsTestResult(null), 3000);
    };

    const copyApiUrl = useCallback(() => {
        void navigator.clipboard.writeText(RESOLVED_API_BASE_URL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);

    const authModeLabel = isDevMode ? "Local dev — stub user (Firebase not configured)" : "Firebase Authentication";
    const hasDevBearer = Boolean(process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN) || Boolean(process.env.NEXT_PUBLIC_DEV_VIEWER_TOKEN);

    // Determine active LLM model label
    const activeLlmLabel = () => {
        if (!backendStatus) return "Loading…";
        const { llm_provider, openai_api_configured, claude_api_configured, gemini_api_configured, llm_model, openai_model, gemini_model } = backendStatus;
        if (llm_provider === "openai") return openai_api_configured ? `OpenAI-compatible — ${openai_model}` : "OpenAI-compatible (API key not set)";
        if (llm_provider === "claude") return claude_api_configured ? `Claude — ${llm_model}` : "Claude (API key not set)";
        if (llm_provider === "gemini") return gemini_api_configured ? `Gemini — ${gemini_model}` : "Gemini (API key not set)";
        // auto
        if (openai_api_configured) return `Auto → OpenAI-compatible — ${openai_model}`;
        if (gemini_api_configured) return `Auto → Gemini — ${gemini_model}`;
        if (claude_api_configured) return `Auto → Claude — ${llm_model}`;
        return "Auto (no API keys configured)";
    };

    const policyEvalAvailable = backendStatus?.claude_api_configured ?? false;

    return (
        <div style={{ padding: "var(--s-4)", minHeight: "100%" }}>
            <TopBar
                title="Settings"
                subtitle="Configure your organization, integrations, and AI provider"
                actions={null}
            />

            {/* GitHub OAuth notice banner */}
            {githubNotice && (
                <div style={{
                    marginTop: "var(--s-4)",
                    padding: "var(--s-3) var(--s-4)",
                    borderRadius: "var(--r-md)",
                    border: `1px solid ${githubNotice === "connected" ? "var(--c-live)" : "var(--c-critical)"}`,
                    background: githubNotice === "connected" ? "rgba(57,255,20,0.06)" : "rgba(239,68,68,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--s-2)",
                    fontSize: "var(--fs-13)",
                    color: githubNotice === "connected" ? "var(--c-live)" : "var(--c-critical)",
                    maxWidth: 680,
                }}>
                    {githubNotice === "connected"
                        ? <><CheckCircleOutlinedIcon sx={{ fontSize: 16 }} /> GitHub connected successfully — you can now run compliance scans</>
                        : <><LinkOffOutlinedIcon sx={{ fontSize: 16 }} /> GitHub connection failed — try again</>}
                    <button
                        type="button"
                        style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "var(--fs-12)" }}
                        onClick={() => setGithubNotice(null)}
                    >✕</button>
                </div>
            )}

            {/* Slack OAuth notice banner */}
            {slackNotice && (
                <div style={{
                    marginTop: "var(--s-4)",
                    padding: "var(--s-3) var(--s-4)",
                    borderRadius: "var(--r-md)",
                    border: `1px solid ${slackNotice === "connected" ? "var(--c-live)" : "var(--c-critical)"}`,
                    background: slackNotice === "connected" ? "rgba(57,255,20,0.06)" : "rgba(239,68,68,0.06)",
                    display: "flex",
                    alignItems: "center",
                    gap: "var(--s-2)",
                    fontSize: "var(--fs-13)",
                    color: slackNotice === "connected" ? "var(--c-live)" : "var(--c-critical)",
                    maxWidth: 680,
                }}>
                    {slackNotice === "connected"
                        ? <><CheckCircleOutlinedIcon sx={{ fontSize: 16 }} /> Slack connected successfully — notifications will be sent to your channel</>
                        : <><LinkOffOutlinedIcon sx={{ fontSize: 16 }} /> Slack connection failed — try again</>}
                    <button
                        type="button"
                        style={{ marginLeft: "auto", background: "none", border: "none", cursor: "pointer", color: "inherit", fontSize: "var(--fs-12)" }}
                        onClick={() => setSlackNotice(null)}
                    >✕</button>
                </div>
            )}

            <div style={{ marginTop: "var(--s-6)", display: "flex", flexDirection: "column", gap: "var(--s-4)", maxWidth: 680 }}>

                {/* ── 1. Account ────────────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<SettingsOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Account"
                        subtitle={authModeLabel}
                    />
                    <SettingRow label="Email" value={user?.email ?? (isDevMode ? "dev@local (stub)" : "—")} />
                    <SettingRow label="User ID" value={user?.uid ?? "—"} mono />
                    <SettingRow label="Role" value={isDevMode ? "Admin (dev)" : "Admin"} />

                    {!isDevMode && (
                        <button
                            type="button"
                            className="btn btn--secondary btn--sm"
                            style={{ marginTop: "var(--s-3)", display: "inline-flex", alignItems: "center", gap: 8 }}
                            disabled={loading}
                            onClick={() => void logOut()}
                        >
                            <LogoutOutlinedIcon sx={{ fontSize: 16 }} />
                            Sign out
                        </button>
                    )}
                    {isDevMode && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-2)", lineHeight: 1.5 }}>
                            Running in dev mode. Set <code style={{ fontFamily: "monospace" }}>NEXT_PUBLIC_FIREBASE_API_KEY</code> in <code style={{ fontFamily: "monospace" }}>.env.local</code> to enable real authentication.
                        </p>
                    )}
                </SectionCard>

                {/* ── 2. Organization Profile ───────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<BusinessOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Organization"
                        subtitle="Used as context in scan reports and AI policy generation"
                    />
                    <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                        <label className="form-label">Organization name</label>
                        <input
                            className="input"
                            value={orgName}
                            onChange={e => setOrgName(e.target.value)}
                            placeholder="e.g. Mouser Electronics"
                        />
                    </div>
                    <div className="form-group" style={{ marginBottom: "var(--s-4)" }}>
                        <label className="form-label">Compliance contact email</label>
                        <input
                            className="input"
                            type="email"
                            value={orgContact}
                            onChange={e => setOrgContact(e.target.value)}
                            placeholder="e.g. governance@yourcompany.com"
                        />
                    </div>
                    <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={saveOrg}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                        {orgSaved ? <><CheckOutlinedIcon sx={{ fontSize: 16 }} /> Saved</> : "Save"}
                    </button>
                </SectionCard>

                {/* ── 3. GitHub Integration ─────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<GitHubIcon sx={{ fontSize: 24 }} />}
                        title="GitHub Integration"
                        subtitle="Connect GitHub to enable Copilot compliance scanning"
                        badge={
                            githubStatus?.connected
                                ? <span className="badge badge--live">Connected</span>
                                : <span className="badge badge--neutral">Not connected</span>
                        }
                    />

                    {githubLoading && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>Checking status…</p>
                    )}

                    {!githubLoading && githubStatus?.connected && githubStatus.user && (
                        <>
                            <SettingRow label="GitHub account" value={`@${githubStatus.user.login}${githubStatus.user.name ? ` — ${githubStatus.user.name}` : ""}`} />
                            <SettingRow label="Public repositories" value={String(githubStatus.user.public_repos)} />
                            {githubStatus.user.orgs.length > 0 && (
                                <SettingRow label="Organizations" value={githubStatus.user.orgs.join(", ")} />
                            )}
                            <SettingRow label="Connected at" value={new Date(githubStatus.user.connected_at).toLocaleString()} />

                            <Divider />

                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                TrustFabric stores a GitHub OAuth token in Firestore to read your organization's Copilot configuration and repository security settings. No code is ever read or modified.
                            </p>

                            <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                onClick={() => void disconnectGitHub()}
                            >
                                <LinkOffOutlinedIcon sx={{ fontSize: 16 }} />
                                Disconnect GitHub
                            </button>
                        </>
                    )}

                    {!githubLoading && !githubStatus?.connected && (
                        <>
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                Connect your GitHub account (personal or enterprise org) to scan Copilot configuration, branch protection, vulnerability alerts, and Actions permissions.
                            </p>
                            {!backendStatus?.github_oauth_configured && (
                                <div style={{
                                    display: "flex", alignItems: "center", gap: "var(--s-2)",
                                    padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                                    fontSize: "var(--fs-12)", color: "var(--c-warning, #f59e0b)", marginBottom: "var(--s-3)",
                                }}>
                                    <WarningAmberOutlinedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                                    GitHub OAuth not configured on the server. Set <code style={{ fontFamily: "monospace", margin: "0 4px" }}>GITHUB_CLIENT_ID</code> and <code style={{ fontFamily: "monospace", margin: "0 4px" }}>GITHUB_CLIENT_SECRET</code> in your backend <code style={{ fontFamily: "monospace" }}>.env</code>.
                                </div>
                            )}
                            <button
                                type="button"
                                className="btn btn--primary"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                disabled={!backendStatus?.github_oauth_configured}
                                onClick={() => void connectGitHub()}
                            >
                                <GitHubIcon sx={{ fontSize: 18 }} />
                                Connect GitHub
                            </button>
                        </>
                    )}
                </SectionCard>

                {/* ── 3b. Slack Integration ────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<TagOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Slack Integration"
                        subtitle="Receive notifications for scan results, violations, and system changes"
                        badge={
                            slackStatus?.connected
                                ? <span className="badge badge--live">Connected</span>
                                : <span className="badge badge--neutral">Not connected</span>
                        }
                    />

                    {slackLoading && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>Checking status…</p>
                    )}

                    {!slackLoading && slackStatus?.connected && slackStatus.info && (
                        <>
                            <SettingRow label="Workspace" value={slackStatus.info.team_name} />
                            <SettingRow label="Connected at" value={new Date(slackStatus.info.connected_at).toLocaleString()} />

                            <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                                <label className="form-label">Notification channel</label>
                                <select
                                    className="input"
                                    value={slackStatus.info.channel_id}
                                    onChange={e => void changeSlackChannel(e.target.value)}
                                    disabled={slackChannelsLoading}
                                    style={{ cursor: "pointer" }}
                                >
                                    {slackChannelsLoading && <option>Loading channels…</option>}
                                    {!slackChannelsLoading && slackChannels.length === 0 && (
                                        <option value={slackStatus.info.channel_id}>#{slackStatus.info.channel_name}</option>
                                    )}
                                    {slackChannels.map(ch => (
                                        <option key={ch.id} value={ch.id}>#{ch.name}</option>
                                    ))}
                                </select>
                            </div>

                            <Divider />

                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                TrustFabric will post notifications to the selected channel when compliance scans complete, violations are found, or AI systems are created, updated, or deleted.
                            </p>

                            <div style={{ display: "flex", gap: "var(--s-2)" }}>
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                    disabled={slackTestSending}
                                    onClick={() => void testSlack()}
                                >
                                    <SendOutlinedIcon sx={{ fontSize: 16 }} />
                                    {slackTestSending ? "Sending…" : slackTestResult === "ok" ? "Sent!" : slackTestResult === "error" ? "Failed" : "Test Notification"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                    onClick={() => void disconnectSlack()}
                                >
                                    <LinkOffOutlinedIcon sx={{ fontSize: 16 }} />
                                    Disconnect Slack
                                </button>
                            </div>
                        </>
                    )}

                    {!slackLoading && !slackStatus?.connected && (
                        <>
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                Connect your Slack workspace to receive real-time notifications when compliance scans complete, violations are detected, or AI systems change.
                            </p>
                            {!backendStatus?.slack_oauth_configured && (
                                <div style={{
                                    display: "flex", alignItems: "center", gap: "var(--s-2)",
                                    padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                                    fontSize: "var(--fs-12)", color: "var(--c-warning, #f59e0b)", marginBottom: "var(--s-3)",
                                }}>
                                    <WarningAmberOutlinedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                                    Slack OAuth not configured on the server. Set <code style={{ fontFamily: "monospace", margin: "0 4px" }}>SLACK_CLIENT_ID</code> and <code style={{ fontFamily: "monospace", margin: "0 4px" }}>SLACK_CLIENT_SECRET</code> in your backend <code style={{ fontFamily: "monospace" }}>.env</code>.
                                </div>
                            )}
                            <button
                                type="button"
                                className="btn btn--primary"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                disabled={!backendStatus?.slack_oauth_configured}
                                onClick={() => void connectSlack()}
                            >
                                <TagOutlinedIcon sx={{ fontSize: 18 }} />
                                Connect Slack
                            </button>
                        </>
                    )}
                </SectionCard>

                {/* ── 3c. AWS Integration ─────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<CloudOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="AWS Integration"
                        subtitle="Connect your AWS account for cloud infrastructure compliance auditing"
                        badge={
                            awsStatus?.connected
                                ? <span className="badge badge--live">Connected</span>
                                : <span className="badge badge--neutral">Not connected</span>
                        }
                    />

                    {awsLoading && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>Checking status…</p>
                    )}

                    {!awsLoading && awsStatus?.connected && awsStatus.info && (
                        <>
                            <SettingRow label="Account ID" value={awsStatus.info.account_id} mono />
                            {awsStatus.info.account_alias && (
                                <SettingRow label="Account alias" value={awsStatus.info.account_alias} />
                            )}
                            <SettingRow label="Region" value={awsStatus.info.region} />
                            <SettingRow label="Role ARN" value={awsStatus.info.role_arn} mono />
                            <SettingRow label="Connected at" value={new Date(awsStatus.info.connected_at).toLocaleString()} />

                            <Divider />

                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                TrustFabric uses STS AssumeRole with a read-only cross-account IAM role to audit IAM, S3, CloudTrail, AWS Config, and Security Hub. No credentials are stored — temporary sessions are created on demand.
                            </p>

                            <div style={{ display: "flex", gap: "var(--s-2)" }}>
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                    disabled={awsTesting}
                                    onClick={() => void testAws()}
                                >
                                    {awsTesting ? "Testing…" : awsTestResult === "ok" ? "Valid!" : awsTestResult === "error" ? "Failed" : "Test Connection"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                    onClick={() => void disconnectAws()}
                                >
                                    <LinkOffOutlinedIcon sx={{ fontSize: 16 }} />
                                    Disconnect AWS
                                </button>
                            </div>
                        </>
                    )}

                    {!awsLoading && !awsStatus?.connected && (
                        <>
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                Create a read-only IAM role in your AWS account with the <strong>SecurityAudit</strong> managed policy attached, then paste the Role ARN below.
                            </p>

                            <div style={{
                                padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                                background: "rgba(255,255,255,0.03)", border: "1px solid var(--c-border)",
                                fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-4)", lineHeight: 1.7,
                            }}>
                                <div style={{ fontWeight: "var(--fw-medium)", marginBottom: 4 }}>Setup steps:</div>
                                <ol style={{ margin: 0, paddingLeft: "1.4em" }}>
                                    <li>Go to AWS IAM → Roles → Create role</li>
                                    <li>Select "Another AWS account" as trusted entity</li>
                                    <li>Attach the <code style={{ fontFamily: "monospace" }}>SecurityAudit</code> managed policy</li>
                                    <li>Optionally attach <code style={{ fontFamily: "monospace" }}>AWSSecurityHubReadOnlyAccess</code></li>
                                    <li>Copy the Role ARN and paste it below</li>
                                </ol>
                            </div>

                            <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                                <label className="form-label">IAM Role ARN</label>
                                <input
                                    className="input"
                                    value={awsRoleArn}
                                    onChange={e => { setAwsRoleArn(e.target.value); setAwsError(null); }}
                                    placeholder="arn:aws:iam::123456789012:role/TrustFabricAudit"
                                    style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-12)" }}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: "var(--s-4)" }}>
                                <label className="form-label">Region</label>
                                <select
                                    className="input"
                                    value={awsRegion}
                                    onChange={e => setAwsRegion(e.target.value)}
                                    style={{ cursor: "pointer" }}
                                >
                                    {["us-east-1", "us-east-2", "us-west-1", "us-west-2", "eu-west-1", "eu-west-2", "eu-central-1", "ap-southeast-1", "ap-northeast-1"].map(r => (
                                        <option key={r} value={r}>{r}</option>
                                    ))}
                                </select>
                            </div>

                            {awsError && (
                                <div style={{
                                    display: "flex", alignItems: "center", gap: "var(--s-2)",
                                    padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                                    fontSize: "var(--fs-12)", color: "var(--c-critical, #ef4444)", marginBottom: "var(--s-3)",
                                }}>
                                    <WarningAmberOutlinedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                                    {awsError}
                                </div>
                            )}

                            <button
                                type="button"
                                className="btn btn--primary"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                disabled={!awsRoleArn.startsWith("arn:aws:iam::") || awsConnecting}
                                onClick={() => void connectAws()}
                            >
                                <CloudOutlinedIcon sx={{ fontSize: 18 }} />
                                {awsConnecting ? "Connecting…" : "Connect AWS"}
                            </button>
                        </>
                    )}
                </SectionCard>

                {/* ── 4. Scan Defaults ──────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<SearchOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Scan Defaults"
                        subtitle="Pre-filled values used when starting a new compliance scan"
                    />
                    <div className="form-group" style={{ marginBottom: "var(--s-4)" }}>
                        <label className="form-label">Default GitHub organization</label>
                        <input
                            className="input"
                            value={defaultGithubOrg}
                            onChange={e => setDefaultGithubOrg(e.target.value)}
                            placeholder={githubStatus?.user?.login ?? "your-github-username-or-org"}
                        />
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-1)" }}>
                            For personal accounts use your GitHub username. For enterprise use the org slug (e.g. <code style={{ fontFamily: "monospace" }}>mouser-electronics</code>).
                        </p>
                    </div>
                    <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={saveScanDefaults}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                        {scanDefaultsSaved ? <><CheckOutlinedIcon sx={{ fontSize: 16 }} /> Saved</> : "Save defaults"}
                    </button>
                </SectionCard>

                {/* ── 5. AI Provider ────────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<AutoAwesomeOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="AI Provider"
                        subtitle="System recommendations and policy generation follow the configured provider; custom policy evaluation during scans still uses Claude"
                    />

                    {statusLoading && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>Loading…</p>
                    )}

                    {backendStatus && (
                        <>
                            <SettingRow label="Active provider" value={activeLlmLabel()} />
                            <SettingRow label="Provider mode" value={backendStatus.llm_provider === "auto" ? "Auto (OpenAI-compatible first, Gemini second, Claude fallback)" : backendStatus.llm_provider} />

                            <div style={{ display: "flex", gap: "var(--s-4)", marginBottom: "var(--s-4)" }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>OpenAI-compatible</div>
                                    <StatusPill ok={backendStatus.openai_api_configured} labelOk={`Configured — ${backendStatus.openai_model}`} labelNo="Not configured" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Claude (Anthropic)</div>
                                    <StatusPill ok={backendStatus.claude_api_configured} labelOk={`Configured — ${backendStatus.llm_model}`} labelNo="Not configured" />
                                </div>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.04em" }}>Gemini (Google)</div>
                                    <StatusPill ok={backendStatus.gemini_api_configured} labelOk={`Configured — ${backendStatus.gemini_model}`} labelNo="Not configured" />
                                </div>
                            </div>

                            <Divider />

                            {/* Policy evaluation status */}
                            <div style={{
                                display: "flex", alignItems: "flex-start", gap: "var(--s-3)",
                                padding: "var(--s-3) var(--s-4)", borderRadius: "var(--r-md)",
                                background: policyEvalAvailable ? "rgba(57,255,20,0.04)" : "rgba(255,255,255,0.03)",
                                border: `1px solid ${policyEvalAvailable ? "rgba(57,255,20,0.2)" : "var(--c-border)"}`,
                            }}>
                                <div style={{ marginTop: 2 }}>
                                    {policyEvalAvailable
                                        ? <CheckCircleOutlinedIcon sx={{ fontSize: 18, color: "var(--c-live)" }} />
                                        : <WarningAmberOutlinedIcon sx={{ fontSize: 18, color: "var(--c-warning, #f59e0b)" }} />}
                                </div>
                                <div>
                                    <div style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-medium)", marginBottom: 4 }}>
                                        {policyEvalAvailable ? "Custom policy evaluation active" : "Custom policy evaluation unavailable"}
                                    </div>
                                    <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", lineHeight: 1.5 }}>
                                        {policyEvalAvailable
                                            ? "Every compliance scan will automatically evaluate all your active governance policies (AI-generated, manual, or template) against the real GitHub configuration using Claude."
                                            : "Set CLAUDE_API_KEY in your backend .env to enable LLM-based evaluation of custom governance policies during scans."}
                                    </div>
                                </div>
                            </div>

                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-3)", lineHeight: 1.5 }}>
                                To change the provider, set <code style={{ fontFamily: "monospace" }}>COPILOT_PROVIDER=openai|claude|gemini|auto</code> in your backend <code style={{ fontFamily: "monospace" }}>.env</code> and restart the server.
                            </p>
                        </>
                    )}
                </SectionCard>

                {/* ── 6. Notification Preferences ──────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<NotificationsOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Notification Preferences"
                        subtitle="In-app alerts for governance events"
                    />
                    <NotifToggle
                        label="Scan violations detected"
                        description="Alert when a compliance scan finds new policy violations"
                        value={notifViolations}
                        onChange={v => { setNotifViolations(v); saveNotif(LS_NOTIF_VIOLATIONS, v); }}
                    />
                    <NotifToggle
                        label="Scan completed"
                        description="Alert when a compliance scan finishes successfully"
                        value={notifScans}
                        onChange={v => { setNotifScans(v); saveNotif(LS_NOTIF_SCANS, v); }}
                    />
                    <NotifToggle
                        label="Policy status changes"
                        description="Alert when a governance policy is activated or deactivated"
                        value={notifPolicyChanges}
                        onChange={v => { setNotifPolicyChanges(v); saveNotif(LS_NOTIF_POLICY_CHANGES, v); }}
                    />
                    <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-1)", lineHeight: 1.5 }}>
                        Email delivery and webhook integrations are on the roadmap. Preferences are saved locally for now.
                    </p>
                </SectionCard>

                {/* ── 7. API & Developer ────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<LinkOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="API & Developer"
                        subtitle="Backend connection and authentication diagnostics"
                    />
                    <SettingRow label="API base URL" value={RESOLVED_API_BASE_URL} mono />
                    <div style={{ display: "flex", gap: "var(--s-2)", marginBottom: "var(--s-3)" }}>
                        <button type="button" className="btn btn--ghost btn--sm" style={{ gap: 6 }} onClick={copyApiUrl}>
                            {copied ? <CheckOutlinedIcon sx={{ fontSize: 16 }} /> : <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />}
                            {copied ? "Copied" : "Copy URL"}
                        </button>
                        <a
                            href={`${RESOLVED_API_BASE_URL}/docs`}
                            target="_blank"
                            rel="noreferrer"
                            className="btn btn--ghost btn--sm"
                            style={{ gap: 6, textDecoration: "none" }}
                        >
                            Open API docs ↗
                        </a>
                    </div>

                    <SettingRow
                        label="Firebase client"
                        value={isFirebaseConfigured ? "Configured" : "Not configured — using dev stub user"}
                    />
                    <SettingRow
                        label="Dev bearer token"
                        value={hasDevBearer ? "Set (NEXT_PUBLIC_DEV_ADMIN_TOKEN)" : "Not set"}
                    />
                    {backendStatus && (
                        <>
                            <SettingRow label="Backend environment" value={`${backendStatus.app_env} — v${backendStatus.app_version}`} />
                            <SettingRow label="Rate limit" value={`${backendStatus.rate_limit_per_minute} requests / minute`} />
                        </>
                    )}
                </SectionCard>

                {/* ── 8. About ─────────────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<InfoOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="About TrustFabric"
                    />
                    <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", lineHeight: 1.7, marginBottom: "var(--s-4)" }}>
                        TrustFabric is an AI Governance SaaS platform that continuously monitors organizational AI tool configurations and ensures compliance with defined governance policies. Built as a senior design capstone project.
                    </p>

                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-3)", marginBottom: "var(--s-4)" }}>
                        {[
                            { fn: "Govern", desc: "Role-based access, advisory-only AI, policy lifecycle" },
                            { fn: "Map", desc: "AI system registry with risk classification" },
                            { fn: "Measure", desc: "LLM interaction logging, audit trail, risk scoring" },
                            { fn: "Manage", desc: "Rate limiting, human-in-the-loop, scan enforcement" },
                        ].map(({ fn, desc }) => (
                            <div key={fn} style={{
                                padding: "var(--s-3)",
                                borderRadius: "var(--r-sm)",
                                border: "1px solid var(--c-border)",
                                background: "rgba(255,255,255,0.02)",
                            }}>
                                <div style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", color: "var(--c-accent)", marginBottom: 4 }}>
                                    NIST AI RMF — {fn}
                                </div>
                                <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", lineHeight: 1.5 }}>{desc}</div>
                            </div>
                        ))}
                    </div>

                    {backendStatus && (
                        <SettingRow label="Version" value={`v${backendStatus.app_version} (${backendStatus.app_env})`} />
                    )}
                </SectionCard>

            </div>
        </div>
    );
}
