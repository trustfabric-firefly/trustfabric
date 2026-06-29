"use client";
import { SettingsOutlinedIcon, LogoutOutlinedIcon, LinkOutlinedIcon, ContentCopyOutlinedIcon, CheckOutlinedIcon, GitHubIcon, CheckCircleOutlinedIcon, LinkOffOutlinedIcon, BrushOutlinedIcon, AutoAwesomeOutlinedIcon, BusinessOutlinedIcon, GroupOutlinedIcon, PersonRemoveOutlinedIcon, VpnKeyOutlinedIcon, NotificationsOutlinedIcon, SearchOutlinedIcon, InfoOutlinedIcon, WarningAmberOutlinedIcon, SendOutlinedIcon, TagOutlinedIcon, CloudOutlinedIcon } from "@/lib/icons";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TopBar } from "@/components/layout/TopBar";
import { useAuth } from "@/providers/AuthProvider";
import {
    RESOLVED_API_BASE_URL,
    integrationsApi,
    organizationsApi,
    settingsApi,
    type OrgRole,
} from "@/lib/api";
import { useOrganization } from "@/providers/OrganizationProvider";
import type { SlackChannel, AwsIntegrationStatus } from "@/types";
import { isFirebaseConfigured } from "@/lib/firebase";
import { IS_PRODUCTION_BUILD } from "@/lib/auth-config";
import { INTEGRATION_SECTION_IDS } from "@/lib/integration-sections";

// ─── Local storage keys ────────────────────────────────────────────────────────
const LS_DEFAULT_GITHUB_ORG = "tf_default_github_org";

const ROLE_LABELS: Record<OrgRole, string> = {
    owner: "Owner",
    admin: "Admin",
    security_admin: "Security admin",
    auditor: "Auditor",
    viewer: "Viewer",
};

function assignableRoles(actorRole: string): OrgRole[] {
    if (actorRole === "owner" || actorRole === "admin") {
        return ["admin", "security_admin", "auditor", "viewer"];
    }
    if (actorRole === "security_admin") {
        return ["auditor", "viewer"];
    }
    return [];
}

function canManageMember(
    actorRole: string,
    targetRole: string,
    targetUserId: string,
    selfUserId: string
): boolean {
    if (!selfUserId || targetUserId === selfUserId) return false;
    if (targetRole === "owner") return actorRole === "owner";
    if (actorRole === "owner") return true;
    if (actorRole === "admin") return targetRole !== "owner";
    if (actorRole === "security_admin") {
        return targetRole === "auditor" || targetRole === "viewer";
    }
    return false;
}
const LS_NOTIF_VIOLATIONS = "tf_notif_violations";
const LS_NOTIF_SCANS = "tf_notif_scans";
const LS_NOTIF_POLICY_CHANGES = "tf_notif_policy_changes";

function ls(key: string, fallback = "") {
    if (typeof window === "undefined") return fallback;
    return localStorage.getItem(key) ?? fallback;
}

// ─── Small presentational components ──────────────────────────────────────────

function SectionCard({ id, children }: { id?: string; children: React.ReactNode }) {
    return (
        <section
            id={id}
            style={{
            padding: "var(--s-5)",
            borderRadius: "var(--r-md)",
            border: "1px solid var(--c-border)",
            background: "var(--c-surface-elevated)",
            ...(id ? { scrollMarginTop: "var(--s-4)" } : {}),
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

function OAuthConnectSteps({ provider }: { provider: "GitHub" | "Slack" }) {
    const steps =
        provider === "GitHub"
            ? [
                "Click Connect GitHub below.",
                "Sign in on GitHub (personal account or your company organization).",
                "Review and approve TrustFabric's read-only access request.",
                "You'll return here automatically when authorization completes.",
            ]
            : [
                "Click Connect Slack below.",
                "Choose your company's Slack workspace and sign in.",
                "Approve TrustFabric to post notifications to channels you select.",
                "You'll return here automatically when authorization completes.",
            ];

    return (
        <ol style={{
            margin: "0 0 var(--s-3)",
            paddingLeft: "var(--s-5)",
            fontSize: "var(--fs-12)",
            color: "var(--c-text-muted)",
            lineHeight: 1.6,
        }}>
            {steps.map((step) => (
                <li key={step} style={{ marginBottom: 4 }}>{step}</li>
            ))}
        </ol>
    );
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
    const {
        activeOrganization,
        activeOrganizationId,
        canAdmin,
        context: orgContext,
        switchOrganization,
        refresh: refreshOrganizations,
    } = useOrganization();
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

    useEffect(() => {
        const scrollToIntegration = () => {
            const hash = window.location.hash.slice(1);
            if (!hash || !(Object.values(INTEGRATION_SECTION_IDS) as string[]).includes(hash)) {
                return;
            }
            const el = document.getElementById(hash);
            el?.scrollIntoView({ behavior: "smooth", block: "start" });
        };

        const frame = requestAnimationFrame(() => {
            requestAnimationFrame(scrollToIntegration);
        });

        window.addEventListener("hashchange", scrollToIntegration);
        return () => {
            cancelAnimationFrame(frame);
            window.removeEventListener("hashchange", scrollToIntegration);
        };
    }, []);

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
    const { data: figmaStatus, isLoading: figmaLoading, refetch: refetchFigma } = useQuery({
        queryKey: ["figma-status"],
        queryFn: integrationsApi.getFigmaStatus,
        retry: false,
    });
    const { data: backendStatus, isLoading: statusLoading } = useQuery({
        queryKey: ["settings-status"],
        queryFn: settingsApi.status,
        retry: false,
    });
    const { data: copilotControls, refetch: refetchCopilotControls } = useQuery({
        queryKey: ["copilot-controls", activeOrganizationId],
        queryFn: organizationsApi.copilotControls,
        enabled: !!activeOrganizationId,
        retry: false,
    });
    const [copilotEnabled, setCopilotEnabled] = useState(true);
    const [copilotMonthlyLimit, setCopilotMonthlyLimit] = useState("200");
    const [copilotCostCap, setCopilotCostCap] = useState("25");
    const [copilotDailyUserLimit, setCopilotDailyUserLimit] = useState("50");
    const [copilotQuotaSaving, setCopilotQuotaSaving] = useState(false);
    const [copilotQuotaSaved, setCopilotQuotaSaved] = useState(false);
    const { data: currentOrg } = useQuery({
        queryKey: ["org-current", activeOrganizationId],
        queryFn: organizationsApi.current,
        enabled: !!activeOrganizationId,
        retry: false,
    });
    const { data: members = [], isLoading: membersLoading, refetch: refetchMembers } = useQuery({
        queryKey: ["org-members", activeOrganizationId],
        queryFn: organizationsApi.members,
        enabled: !!activeOrganizationId,
        retry: false,
    });
    const { data: pendingInvites = [], refetch: refetchInvites } = useQuery({
        queryKey: ["org-invites", activeOrganizationId],
        queryFn: organizationsApi.invites,
        enabled: !!activeOrganizationId && canAdmin,
        retry: false,
    });
    const { data: ssoConfig, refetch: refetchSso } = useQuery({
        queryKey: ["org-sso", activeOrganizationId],
        queryFn: organizationsApi.getSso,
        enabled: !!activeOrganizationId && canAdmin,
        retry: false,
    });

    const selfUserId = currentOrg?.user_id ?? user?.uid ?? "";
    const actorRole = activeOrganization?.role ?? "viewer";
    const inviteRoles = useMemo(() => assignableRoles(actorRole), [actorRole]);

    const [inviteEmail, setInviteEmail] = useState("");
    const [inviteRole, setInviteRole] = useState<OrgRole>("viewer");
    const [inviteSending, setInviteSending] = useState(false);
    const [inviteError, setInviteError] = useState<string | null>(null);

    useEffect(() => {
        if (inviteRoles.length > 0 && !inviteRoles.includes(inviteRole)) {
            setInviteRole(inviteRoles[0]);
        }
    }, [inviteRoles, inviteRole]);
    const [memberActionError, setMemberActionError] = useState<string | null>(null);
    const [memberUpdating, setMemberUpdating] = useState<string | null>(null);

    const [ssoEnabled, setSsoEnabled] = useState(false);
    const [ssoEnforced, setSsoEnforced] = useState(false);
    const [ssoIdpEntityId, setSsoIdpEntityId] = useState("");
    const [ssoIdpUrl, setSsoIdpUrl] = useState("");
    const [ssoCert, setSsoCert] = useState("");
    const [ssoDomains, setSsoDomains] = useState("");
    const [ssoJit, setSsoJit] = useState(true);
    const [ssoDefaultRole, setSsoDefaultRole] = useState<OrgRole>("viewer");
    const [ssoSaving, setSsoSaving] = useState(false);
    const [ssoSaved, setSsoSaved] = useState(false);
    const [ssoError, setSsoError] = useState<string | null>(null);

    useEffect(() => {
        if (!ssoConfig) return;
        setSsoEnabled(ssoConfig.enabled);
        setSsoEnforced(ssoConfig.enforced);
        setSsoIdpEntityId(ssoConfig.idp_entity_id ?? "");
        setSsoIdpUrl(ssoConfig.idp_sso_url ?? "");
        setSsoDomains((ssoConfig.email_domains ?? []).join(", "));
        setSsoJit(ssoConfig.jit_provisioning ?? true);
        setSsoDefaultRole(ssoConfig.default_role ?? "viewer");
    }, [ssoConfig]);

    useEffect(() => {
        if (!copilotControls) return;
        setCopilotEnabled(copilotControls.quota.enabled);
        setCopilotMonthlyLimit(String(copilotControls.quota.monthly_request_limit));
        setCopilotCostCap(
            copilotControls.quota.monthly_cost_cap_usd == null
                ? ""
                : String(copilotControls.quota.monthly_cost_cap_usd)
        );
        setCopilotDailyUserLimit(
            copilotControls.quota.daily_request_limit_per_user == null
                ? ""
                : String(copilotControls.quota.daily_request_limit_per_user)
        );
    }, [copilotControls]);

    const saveCopilotQuota = async () => {
        if (!canAdmin) return;
        setCopilotQuotaSaving(true);
        setCopilotQuotaSaved(false);
        try {
            await organizationsApi.updateCopilotControls({
                enabled: copilotEnabled,
                monthly_request_limit: Number(copilotMonthlyLimit) || 0,
                monthly_cost_cap_usd: copilotCostCap.trim() === "" ? null : Number(copilotCostCap),
                daily_request_limit_per_user:
                    copilotDailyUserLimit.trim() === "" ? null : Number(copilotDailyUserLimit),
            });
            await refetchCopilotControls();
            setCopilotQuotaSaved(true);
            setTimeout(() => setCopilotQuotaSaved(false), 2000);
        } finally {
            setCopilotQuotaSaving(false);
        }
    };

    const saveSso = async () => {
        if (!canAdmin) return;
        setSsoSaving(true);
        setSsoError(null);
        try {
            await organizationsApi.updateSso({
                enabled: ssoEnabled,
                enforced: ssoEnforced,
                idp_entity_id: ssoIdpEntityId.trim(),
                idp_sso_url: ssoIdpUrl.trim(),
                idp_x509_cert: ssoCert.trim(),
                email_domains: ssoDomains.split(",").map((d) => d.trim()).filter(Boolean),
                jit_provisioning: ssoJit,
                default_role: ssoDefaultRole,
            });
            await refetchSso();
            setSsoSaved(true);
            setTimeout(() => setSsoSaved(false), 2000);
        } catch (err) {
            setSsoError(err instanceof Error ? err.message : "Failed to save SSO settings");
        } finally {
            setSsoSaving(false);
        }
    };

    const sendInvite = async () => {
        if (!canAdmin || !inviteEmail.trim()) return;
        setInviteSending(true);
        setInviteError(null);
        try {
            await organizationsApi.inviteMember({
                email: inviteEmail.trim(),
                role: inviteRole,
            });
            setInviteEmail("");
            await Promise.all([refetchMembers(), refetchInvites(), refreshOrganizations()]);
        } catch (err) {
            setInviteError(err instanceof Error ? err.message : "Failed to send invite");
        } finally {
            setInviteSending(false);
        }
    };

    const changeMemberRole = async (userId: string, role: OrgRole) => {
        setMemberUpdating(userId);
        setMemberActionError(null);
        try {
            await organizationsApi.updateMemberRole(userId, role);
            await refetchMembers();
        } catch (err) {
            setMemberActionError(err instanceof Error ? err.message : "Failed to update role");
        } finally {
            setMemberUpdating(null);
        }
    };

    const removeMember = async (userId: string) => {
        setMemberUpdating(userId);
        setMemberActionError(null);
        try {
            await organizationsApi.removeMember(userId);
            await refetchMembers();
        } catch (err) {
            setMemberActionError(err instanceof Error ? err.message : "Failed to remove member");
        } finally {
            setMemberUpdating(null);
        }
    };

    const revokeInvite = async (inviteId: string) => {
        setMemberUpdating(inviteId);
        setInviteError(null);
        try {
            await organizationsApi.revokeInvite(inviteId);
            await refetchInvites();
        } catch (err) {
            setInviteError(err instanceof Error ? err.message : "Failed to revoke invite");
        } finally {
            setMemberUpdating(null);
        }
    };

    const [orgName, setOrgName] = useState("");
    const [orgContact, setOrgContact] = useState("");
    const [orgSaved, setOrgSaved] = useState(false);
    const [orgSaving, setOrgSaving] = useState(false);
    const [orgError, setOrgError] = useState<string | null>(null);

    useEffect(() => {
        if (!activeOrganization) return;
        setOrgName(activeOrganization.organization.name);
        setOrgContact(activeOrganization.organization.compliance_contact_email ?? "");
    }, [activeOrganization]);

    const saveOrg = async () => {
        if (!canAdmin) return;
        setOrgSaving(true);
        setOrgError(null);
        try {
            await organizationsApi.updateCurrent({
                name: orgName.trim(),
                compliance_contact_email: orgContact.trim() || null,
            });
            await refreshOrganizations();
            setOrgSaved(true);
            setTimeout(() => setOrgSaved(false), 2000);
        } catch (err) {
            setOrgError(err instanceof Error ? err.message : "Failed to save organization");
        } finally {
            setOrgSaving(false);
        }
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
    const [githubConnecting, setGithubConnecting] = useState(false);
    const [githubConnectError, setGithubConnectError] = useState<string | null>(null);
    const connectGitHub = async () => {
        setGithubConnecting(true);
        setGithubConnectError(null);
        try {
            const { url } = await integrationsApi.getGitHubConnectUrl();
            window.location.href = url;
        } catch (err) {
            setGithubConnecting(false);
            setGithubConnectError(
                err instanceof Error
                    ? err.message
                    : "Could not start GitHub authorization. Try again or contact support.",
            );
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

    const [slackConnecting, setSlackConnecting] = useState(false);
    const [slackConnectError, setSlackConnectError] = useState<string | null>(null);
    const connectSlack = async () => {
        setSlackConnecting(true);
        setSlackConnectError(null);
        try {
            const { url } = await integrationsApi.getSlackConnectUrl();
            window.location.href = url;
        } catch (err) {
            setSlackConnecting(false);
            setSlackConnectError(
                err instanceof Error
                    ? err.message
                    : "Could not start Slack authorization. Try again or contact support.",
            );
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

    // Figma actions
    const [figmaToken, setFigmaToken] = useState("");
    const [figmaConnecting, setFigmaConnecting] = useState(false);
    const [figmaError, setFigmaError] = useState<string | null>(null);

    const connectFigma = async () => {
        if (!figmaToken.trim()) return;
        setFigmaConnecting(true);
        setFigmaError(null);
        try {
            await integrationsApi.connectFigma(figmaToken.trim());
            await refetchFigma();
            setFigmaToken("");
        } catch (err: unknown) {
            setFigmaError(err instanceof Error ? err.message : "Failed to connect Figma");
        }
        setFigmaConnecting(false);
    };
    const disconnectFigma = async () => {
        try {
            await integrationsApi.disconnectFigma();
            await refetchFigma();
        } catch { /* ignore */ }
    };

    const copyApiUrl = useCallback(() => {
        void navigator.clipboard.writeText(RESOLVED_API_BASE_URL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);

    const showDevDiagnostics = isDevMode && !IS_PRODUCTION_BUILD;
    const actorRoleLabel = activeOrganization?.role
        ? ROLE_LABELS[activeOrganization.role as OrgRole] ?? activeOrganization.role
        : "—";

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
        <main className="page">
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
                        subtitle="Your profile and workspace access"
                    />
                    <SettingRow label="Email" value={user?.email ?? "—"} />
                    <SettingRow label="Workspace role" value={actorRoleLabel} />
                    {showDevDiagnostics && (
                        <>
                            <SettingRow label="User ID" value={user?.uid ?? "—"} mono />
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-2)", lineHeight: 1.5 }}>
                                Local development mode — configure Firebase in <code style={{ fontFamily: "monospace" }}>.env.local</code> for production authentication.
                            </p>
                        </>
                    )}
                    <button
                        type="button"
                        className="btn btn--secondary btn--sm"
                        style={{ marginTop: "var(--s-3)", display: "inline-flex", alignItems: "center", gap: 8 }}
                        disabled={loading || !user}
                        onClick={() => void logOut()}
                    >
                        <LogoutOutlinedIcon sx={{ fontSize: 16 }} />
                        Sign out
                    </button>
                </SectionCard>

                {/* ── 2. Organization Profile ───────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<BusinessOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Organization"
                        subtitle="Workspace profile used in scan reports and AI policy generation"
                    />
                    {(orgContext?.organizations.length ?? 0) > 1 && (
                        <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                            <label className="form-label">Active workspace</label>
                            <select
                                className="input"
                                value={activeOrganizationId ?? ""}
                                onChange={(e) => switchOrganization(e.target.value)}
                            >
                                {orgContext?.organizations.map((entry) => (
                                    <option key={entry.organization.id} value={entry.organization.id}>
                                        {entry.organization.name} ({entry.role})
                                    </option>
                                ))}
                            </select>
                        </div>
                    )}
                    {canAdmin && (
                        <SettingRow
                            label="Workspace ID"
                            value={activeOrganizationId ?? "—"}
                            mono
                        />
                    )}
                    <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                        <label className="form-label">Organization name</label>
                        <input
                            className="input"
                            value={orgName}
                            onChange={e => setOrgName(e.target.value)}
                            placeholder="Your company name"
                            disabled={!canAdmin}
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
                            disabled={!canAdmin}
                        />
                    </div>
                    {!canAdmin && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)" }}>
                            Your role ({actorRoleLabel}) does not allow editing workspace settings.
                        </p>
                    )}
                    {orgError && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-danger)", marginBottom: "var(--s-3)" }}>
                            {orgError}
                        </p>
                    )}
                    <button
                        type="button"
                        className="btn btn--primary btn--sm"
                        onClick={() => void saveOrg()}
                        disabled={!canAdmin || orgSaving}
                        style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                    >
                        {orgSaved ? <><CheckOutlinedIcon sx={{ fontSize: 16 }} /> Saved</> : orgSaving ? "Saving…" : "Save"}
                    </button>
                </SectionCard>

                {/* ── 2b. Team & access ─────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<GroupOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Team & access"
                        subtitle="Invite teammates and manage workspace roles"
                    />

                    {membersLoading && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>Loading members…</p>
                    )}

                    {!membersLoading && (
                        <div style={{ marginBottom: "var(--s-4)" }}>
                            <div style={{
                                fontSize: "var(--fs-11)",
                                color: "var(--c-text-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "var(--s-2)",
                            }}>
                                Members ({members.length})
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                                {members.map((member) => {
                                    const manageable = canAdmin && canManageMember(
                                        actorRole,
                                        member.role,
                                        member.user_id,
                                        selfUserId,
                                    );
                                    return (
                                        <div
                                            key={member.user_id}
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                gap: "var(--s-3)",
                                                padding: "var(--s-3)",
                                                borderRadius: "var(--r-sm)",
                                                border: "1px solid var(--c-border)",
                                                background: "rgba(255,255,255,0.02)",
                                            }}
                                        >
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-medium)" }}>
                                                    {member.email ?? member.user_id}
                                                    {member.user_id === selfUserId ? " (you)" : ""}
                                                </div>
                                                <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: 2 }}>
                                                    Joined {new Date(member.joined_at).toLocaleDateString()}
                                                </div>
                                            </div>
                                            {manageable ? (
                                                <select
                                                    className="input"
                                                    style={{ width: 160, flexShrink: 0 }}
                                                    value={member.role}
                                                    disabled={memberUpdating === member.user_id}
                                                    onChange={(e) => void changeMemberRole(member.user_id, e.target.value as OrgRole)}
                                                >
                                                    {assignableRoles(actorRole).map((role) => (
                                                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                                    ))}
                                                    {member.role === "owner" && (
                                                        <option value="owner">{ROLE_LABELS.owner}</option>
                                                    )}
                                                </select>
                                            ) : (
                                                <span className="badge badge--neutral" style={{ fontSize: "var(--fs-11)" }}>
                                                    {ROLE_LABELS[member.role as OrgRole] ?? member.role}
                                                </span>
                                            )}
                                            {manageable && (
                                                <button
                                                    type="button"
                                                    className="btn btn--secondary btn--sm"
                                                    disabled={memberUpdating === member.user_id}
                                                    onClick={() => void removeMember(member.user_id)}
                                                    title="Remove member"
                                                    style={{ display: "inline-flex", alignItems: "center", gap: 4, flexShrink: 0 }}
                                                >
                                                    <PersonRemoveOutlinedIcon sx={{ fontSize: 16 }} />
                                                </button>
                                            )}
                                        </div>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {canAdmin && pendingInvites.length > 0 && (
                        <div style={{ marginBottom: "var(--s-4)" }}>
                            <div style={{
                                fontSize: "var(--fs-11)",
                                color: "var(--c-text-muted)",
                                textTransform: "uppercase",
                                letterSpacing: "0.04em",
                                marginBottom: "var(--s-2)",
                            }}>
                                Pending invites ({pendingInvites.length})
                            </div>
                            <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-2)" }}>
                                {pendingInvites.map((invite) => (
                                    <div
                                        key={invite.id}
                                        style={{
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "var(--s-3)",
                                            padding: "var(--s-3)",
                                            borderRadius: "var(--r-sm)",
                                            border: "1px dashed var(--c-border)",
                                        }}
                                    >
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontSize: "var(--fs-13)" }}>{invite.email}</div>
                                            <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: 2 }}>
                                                {ROLE_LABELS[invite.role as OrgRole] ?? invite.role} · invited {new Date(invite.created_at).toLocaleDateString()}
                                            </div>
                                        </div>
                                        <button
                                            type="button"
                                            className="btn btn--secondary btn--sm"
                                            disabled={memberUpdating === invite.id}
                                            onClick={() => void revokeInvite(invite.id)}
                                        >
                                            Revoke
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {canAdmin && inviteRoles.length > 0 && (
                        <>
                            <Divider />
                            <div style={{ display: "flex", gap: "var(--s-2)", flexWrap: "wrap", alignItems: "flex-end" }}>
                                <div className="form-group" style={{ flex: "1 1 220px", marginBottom: 0 }}>
                                    <label className="form-label">Invite by email</label>
                                    <input
                                        className="input"
                                        type="email"
                                        value={inviteEmail}
                                        onChange={(e) => { setInviteEmail(e.target.value); setInviteError(null); }}
                                        placeholder="teammate@company.com"
                                    />
                                </div>
                                <div className="form-group" style={{ width: 180, marginBottom: 0 }}>
                                    <label className="form-label">Role</label>
                                    <select
                                        className="input"
                                        value={inviteRole}
                                        onChange={(e) => setInviteRole(e.target.value as OrgRole)}
                                    >
                                        {inviteRoles.map((role) => (
                                            <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                        ))}
                                    </select>
                                </div>
                                <button
                                    type="button"
                                    className="btn btn--primary btn--sm"
                                    disabled={inviteSending || !inviteEmail.trim()}
                                    onClick={() => void sendInvite()}
                                    style={{ marginBottom: 2 }}
                                >
                                    {inviteSending ? "Sending…" : "Send invite"}
                                </button>
                            </div>
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-3)", lineHeight: 1.5 }}>
                                Existing users are added immediately. New users receive access when they sign up with the invited email.
                            </p>
                        </>
                    )}

                    {!canAdmin && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", lineHeight: 1.5 }}>
                            Contact a workspace admin to invite teammates or change roles.
                        </p>
                    )}

                    {(inviteError || memberActionError) && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-danger)", marginTop: "var(--s-3)" }}>
                            {inviteError ?? memberActionError}
                        </p>
                    )}
                </SectionCard>

                {/* ── 2c. SAML SSO ──────────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<VpnKeyOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="SAML SSO"
                        subtitle="Connect Okta, Azure AD, Google Workspace, or any SAML 2.0 identity provider"
                        badge={
                            ssoConfig?.enabled
                                ? <span className="badge badge--live">Enabled</span>
                                : <span className="badge badge--neutral">Disabled</span>
                        }
                    />

                    {canAdmin && ssoConfig && (
                        <>
                            <SettingRow label="SP Entity ID" value={ssoConfig.sp_entity_id} mono />
                            <SettingRow label="ACS URL" value={ssoConfig.sp_acs_url} mono />
                            <SettingRow label="Metadata URL" value={ssoConfig.metadata_url} mono />

                            <div style={{ display: "flex", gap: "var(--s-4)", flexWrap: "wrap", margin: "var(--s-4) 0" }}>
                                <NotifToggle
                                    label="Enable SAML SSO"
                                    description="Allow users with matching email domains to sign in via your IdP"
                                    value={ssoEnabled}
                                    onChange={setSsoEnabled}
                                />
                                <NotifToggle
                                    label="Enforce SSO"
                                    description="Hide password sign-in for users on configured email domains"
                                    value={ssoEnforced}
                                    onChange={setSsoEnforced}
                                />
                                <NotifToggle
                                    label="Just-in-time provisioning"
                                    description="Automatically add SSO users to this workspace with the default role"
                                    value={ssoJit}
                                    onChange={setSsoJit}
                                />
                            </div>

                            <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                                <label className="form-label">Email domains</label>
                                <input
                                    className="input"
                                    value={ssoDomains}
                                    onChange={(e) => setSsoDomains(e.target.value)}
                                    placeholder="company.com, subsidiary.com"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                                <label className="form-label">IdP Entity ID</label>
                                <input
                                    className="input"
                                    value={ssoIdpEntityId}
                                    onChange={(e) => setSsoIdpEntityId(e.target.value)}
                                    placeholder="urn:example:idp"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                                <label className="form-label">IdP SSO URL</label>
                                <input
                                    className="input"
                                    value={ssoIdpUrl}
                                    onChange={(e) => setSsoIdpUrl(e.target.value)}
                                    placeholder="https://idp.example.com/saml/sso"
                                />
                            </div>
                            <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                                <label className="form-label">IdP X.509 certificate</label>
                                <textarea
                                    className="input"
                                    rows={5}
                                    value={ssoCert}
                                    onChange={(e) => setSsoCert(e.target.value)}
                                    placeholder="Paste the IdP signing certificate (PEM)"
                                    style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-12)" }}
                                />
                                {ssoConfig.idp_x509_cert_configured && !ssoCert && (
                                    <p style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: 4 }}>
                                        A certificate is already saved. Paste a new one to rotate.
                                    </p>
                                )}
                            </div>
                            <div className="form-group" style={{ marginBottom: "var(--s-4)", maxWidth: 240 }}>
                                <label className="form-label">Default role for new SSO users</label>
                                <select
                                    className="input"
                                    value={ssoDefaultRole}
                                    onChange={(e) => setSsoDefaultRole(e.target.value as OrgRole)}
                                >
                                    {(["admin", "security_admin", "auditor", "viewer"] as OrgRole[]).map((role) => (
                                        <option key={role} value={role}>{ROLE_LABELS[role]}</option>
                                    ))}
                                </select>
                            </div>

                            {ssoError && (
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-danger)", marginBottom: "var(--s-3)" }}>
                                    {ssoError}
                                </p>
                            )}

                            <button
                                type="button"
                                className="btn btn--primary btn--sm"
                                disabled={ssoSaving}
                                onClick={() => void saveSso()}
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                            >
                                {ssoSaved ? <><CheckOutlinedIcon sx={{ fontSize: 16 }} /> Saved</> : ssoSaving ? "Saving…" : "Save SSO settings"}
                            </button>
                        </>
                    )}

                    {!canAdmin && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", lineHeight: 1.5 }}>
                            SAML SSO is managed by workspace administrators.
                        </p>
                    )}
                </SectionCard>

                {/* ── 3. GitHub Integration ─────────────────────────────────── */}
                <SectionCard id={INTEGRATION_SECTION_IDS.github}>
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
                                TrustFabric stores an encrypted GitHub OAuth token to read your organization&apos;s Copilot configuration and repository security settings. No code is ever read or modified.
                            </p>

                            <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                disabled={!canAdmin}
                                onClick={() => void disconnectGitHub()}
                            >
                                <LinkOffOutlinedIcon sx={{ fontSize: 16 }} />
                                Disconnect GitHub
                            </button>
                        </>
                    )}

                    {!githubLoading && !githubStatus?.connected && (
                        <>
                            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", marginBottom: "var(--s-3)", lineHeight: 1.6 }}>
                                Authorize TrustFabric to read Copilot settings, branch protection, vulnerability alerts, and Actions permissions.
                                Each workspace connects its own GitHub account — your team does not configure API keys in TrustFabric.
                            </p>
                            {backendStatus?.github_oauth_configured ? (
                                <OAuthConnectSteps provider="GitHub" />
                            ) : (
                                <div style={{
                                    display: "flex", alignItems: "flex-start", gap: "var(--s-2)",
                                    padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                                    fontSize: "var(--fs-12)", color: "var(--c-warning, #f59e0b)", marginBottom: "var(--s-3)",
                                    lineHeight: 1.5,
                                }}>
                                    <WarningAmberOutlinedIcon sx={{ fontSize: 16, flexShrink: 0, marginTop: 2 }} />
                                    {showDevDiagnostics ? (
                                        <>
                                            GitHub OAuth is not configured for this environment. Register a GitHub OAuth App and set{" "}
                                            <code style={{ fontFamily: "monospace" }}>GITHUB_CLIENT_ID</code> and{" "}
                                            <code style={{ fontFamily: "monospace" }}>GITHUB_CLIENT_SECRET</code> once on the TrustFabric backend
                                            (not per customer). Callback URL:{" "}
                                            <code style={{ fontFamily: "monospace" }}>{RESOLVED_API_BASE_URL}/api/v1/integrations/github/callback</code>
                                        </>
                                    ) : (
                                        "GitHub connection is temporarily unavailable on this TrustFabric instance. Contact TrustFabric support — no action is required from your GitHub administrators beyond approving access when Connect is enabled."
                                    )}
                                </div>
                            )}
                            {githubConnectError && (
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-critical)", marginBottom: "var(--s-3)" }}>
                                    {githubConnectError}
                                </p>
                            )}
                            <button
                                type="button"
                                className="btn btn--primary"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                disabled={!canAdmin || !backendStatus?.github_oauth_configured || githubConnecting}
                                onClick={() => void connectGitHub()}
                            >
                                <GitHubIcon sx={{ fontSize: 18 }} />
                                {githubConnecting ? "Redirecting to GitHub…" : "Connect GitHub"}
                            </button>
                            {!canAdmin && (
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-2)" }}>
                                    Only workspace administrators can connect integrations.
                                </p>
                            )}
                        </>
                    )}
                </SectionCard>

                {/* ── 3b. Slack Integration ────────────────────────────────── */}
                <SectionCard id={INTEGRATION_SECTION_IDS.slack}>
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
                                    disabled={!canAdmin || slackChannelsLoading}
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
                                    disabled={!canAdmin || slackTestSending}
                                    onClick={() => void testSlack()}
                                >
                                    <SendOutlinedIcon sx={{ fontSize: 16 }} />
                                    {slackTestSending ? "Sending…" : slackTestResult === "ok" ? "Sent!" : slackTestResult === "error" ? "Failed" : "Test Notification"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                    disabled={!canAdmin}
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
                            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", marginBottom: "var(--s-3)", lineHeight: 1.6 }}>
                                Authorize your Slack workspace to receive notifications when scans complete, violations are detected, or AI systems change.
                                Each workspace connects independently — no Slack app credentials are stored in your browser.
                            </p>
                            {backendStatus?.slack_oauth_configured ? (
                                <OAuthConnectSteps provider="Slack" />
                            ) : (
                                <div style={{
                                    display: "flex", alignItems: "flex-start", gap: "var(--s-2)",
                                    padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                                    background: "rgba(245,158,11,0.08)", border: "1px solid rgba(245,158,11,0.3)",
                                    fontSize: "var(--fs-12)", color: "var(--c-warning, #f59e0b)", marginBottom: "var(--s-3)",
                                    lineHeight: 1.5,
                                }}>
                                    <WarningAmberOutlinedIcon sx={{ fontSize: 16, flexShrink: 0, marginTop: 2 }} />
                                    {showDevDiagnostics ? (
                                        <>
                                            Slack OAuth is not configured for this environment. Create a Slack app and set{" "}
                                            <code style={{ fontFamily: "monospace" }}>SLACK_CLIENT_ID</code> and{" "}
                                            <code style={{ fontFamily: "monospace" }}>SLACK_CLIENT_SECRET</code> once on the TrustFabric backend.
                                            Redirect URL:{" "}
                                            <code style={{ fontFamily: "monospace" }}>{RESOLVED_API_BASE_URL}/api/v1/integrations/slack/callback</code>
                                        </>
                                    ) : (
                                        "Slack connection is temporarily unavailable on this TrustFabric instance. Contact TrustFabric support."
                                    )}
                                </div>
                            )}
                            {slackConnectError && (
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-critical)", marginBottom: "var(--s-3)" }}>
                                    {slackConnectError}
                                </p>
                            )}
                            <button
                                type="button"
                                className="btn btn--primary"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                disabled={!canAdmin || !backendStatus?.slack_oauth_configured || slackConnecting}
                                onClick={() => void connectSlack()}
                            >
                                <TagOutlinedIcon sx={{ fontSize: 18 }} />
                                {slackConnecting ? "Redirecting to Slack…" : "Connect Slack"}
                            </button>
                            {!canAdmin && (
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-2)" }}>
                                    Only workspace administrators can connect integrations.
                                </p>
                            )}
                        </>
                    )}
                </SectionCard>

                {/* ── 3c. AWS Integration ─────────────────────────────────── */}
                <SectionCard id={INTEGRATION_SECTION_IDS.aws}>
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
                                    disabled={!canAdmin || awsTesting}
                                    onClick={() => void testAws()}
                                >
                                    {awsTesting ? "Testing…" : awsTestResult === "ok" ? "Valid!" : awsTestResult === "error" ? "Failed" : "Test Connection"}
                                </button>
                                <button
                                    type="button"
                                    className="btn btn--secondary btn--sm"
                                    style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                    disabled={!canAdmin}
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
                                disabled={!canAdmin || !awsRoleArn.startsWith("arn:aws:iam::") || awsConnecting}
                                onClick={() => void connectAws()}
                            >
                                <CloudOutlinedIcon sx={{ fontSize: 18 }} />
                                {awsConnecting ? "Connecting…" : "Connect AWS"}
                            </button>
                        </>
                    )}
                </SectionCard>

                {/* ── 3d. Figma Integration ─────────────────────────────────── */}
                <SectionCard id={INTEGRATION_SECTION_IDS.figma}>
                    <SectionHeader
                        icon={<BrushOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="Figma Integration"
                        subtitle="Connect Figma to enable automated brand compliance scanning of marketing assets"
                        badge={
                            figmaStatus?.connected
                                ? <span className="badge badge--live">Connected</span>
                                : <span className="badge badge--neutral">Not connected</span>
                        }
                    />

                    {figmaLoading && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>Checking status…</p>
                    )}

                    {!figmaLoading && figmaStatus?.connected && figmaStatus.user && (
                        <>
                            <SettingRow label="Figma account" value={`@${figmaStatus.user.handle} — ${figmaStatus.user.email}`} />
                            <SettingRow
                                label="Connected at"
                                value={
                                    figmaStatus.user.connected_at
                                        ? new Date(figmaStatus.user.connected_at).toLocaleString()
                                        : "—"
                                }
                            />
                            <Divider />
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                Tokens are encrypted at rest per workspace. TrustFabric uses your Figma token to fetch design frames and evaluate them against brand guidelines.
                            </p>
                            <button
                                type="button"
                                className="btn btn--secondary btn--sm"
                                style={{ display: "inline-flex", alignItems: "center", gap: 6 }}
                                disabled={!canAdmin}
                                onClick={() => void disconnectFigma()}
                            >
                                <LinkOffOutlinedIcon sx={{ fontSize: 16 }} />
                                Disconnect Figma
                            </button>
                        </>
                    )}

                    {!figmaLoading && !figmaStatus?.connected && (
                        <>
                            <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)", lineHeight: 1.5 }}>
                                Create a Figma personal access token with file read access, then paste it below. Each workspace stores its own token — nothing is shared across tenants.
                            </p>
                            <div className="form-group" style={{ marginBottom: "var(--s-3)" }}>
                                <label className="form-label">Figma personal access token</label>
                                <input
                                    className="input"
                                    type="password"
                                    value={figmaToken}
                                    onChange={(e) => { setFigmaToken(e.target.value); setFigmaError(null); }}
                                    placeholder="figd_..."
                                    autoComplete="off"
                                    style={{ fontFamily: "ui-monospace, monospace", fontSize: "var(--fs-12)" }}
                                />
                            </div>
                            {figmaError && (
                                <div style={{
                                    display: "flex", alignItems: "center", gap: "var(--s-2)",
                                    padding: "var(--s-3)", borderRadius: "var(--r-sm)",
                                    background: "rgba(239,68,68,0.08)", border: "1px solid rgba(239,68,68,0.3)",
                                    fontSize: "var(--fs-12)", color: "var(--c-critical, #ef4444)", marginBottom: "var(--s-3)",
                                }}>
                                    <WarningAmberOutlinedIcon sx={{ fontSize: 16, flexShrink: 0 }} />
                                    {figmaError}
                                </div>
                            )}
                            <button
                                type="button"
                                className="btn btn--primary"
                                style={{ display: "inline-flex", alignItems: "center", gap: 8 }}
                                disabled={!canAdmin || figmaToken.trim().length < 10 || figmaConnecting}
                                onClick={() => void connectFigma()}
                            >
                                <BrushOutlinedIcon sx={{ fontSize: 18 }} />
                                {figmaConnecting ? "Connecting…" : "Connect Figma"}
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
                            For personal accounts use your GitHub username. For enterprise use your organization slug (e.g. <code style={{ fontFamily: "monospace" }}>your-org</code>).
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

                            {copilotControls && (
                                <div style={{ marginBottom: "var(--s-4)" }}>
                                    <div style={{ fontSize: "var(--fs-13)", fontWeight: "var(--fw-medium)", marginBottom: "var(--s-3)" }}>
                                        Copilot usage &amp; cost controls
                                    </div>
                                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s-3)", marginBottom: "var(--s-3)" }}>
                                        <SettingRow
                                            label="This month"
                                            value={`${copilotControls.usage.request_count} requests`}
                                        />
                                        <SettingRow
                                            label="Est. spend"
                                            value={`$${copilotControls.usage.estimated_cost_usd.toFixed(2)}`}
                                        />
                                        <SettingRow
                                            label="Period"
                                            value={copilotControls.usage.period}
                                        />
                                        <SettingRow
                                            label="Status"
                                            value={copilotControls.quota.enabled ? "Enabled" : "Disabled"}
                                        />
                                    </div>
                                    {copilotControls.quota.monthly_request_limit > 0 && (
                                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-3)" }}>
                                            Monthly limit: {copilotControls.usage.request_count} / {copilotControls.quota.monthly_request_limit} requests
                                            {copilotControls.quota.monthly_cost_cap_usd != null && (
                                                <> · ${copilotControls.usage.estimated_cost_usd.toFixed(2)} / ${copilotControls.quota.monthly_cost_cap_usd.toFixed(2)} cap</>
                                            )}
                                        </p>
                                    )}
                                    {canAdmin ? (
                                        <div style={{ display: "grid", gap: "var(--s-3)" }}>
                                            <NotifToggle
                                                label="Enable governance copilot"
                                                description="Disable to block all copilot recommendations and policy generation for this organization"
                                                value={copilotEnabled}
                                                onChange={setCopilotEnabled}
                                            />
                                            <div className="form-group">
                                                <label className="form-label">Monthly request limit (0 = unlimited)</label>
                                                <input
                                                    className="input"
                                                    type="number"
                                                    min={0}
                                                    max={copilotControls.platform_max_monthly_request_limit}
                                                    value={copilotMonthlyLimit}
                                                    onChange={(e) => setCopilotMonthlyLimit(e.target.value)}
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Monthly cost cap (USD, blank = no cap)</label>
                                                <input
                                                    className="input"
                                                    type="number"
                                                    min={0}
                                                    max={copilotControls.platform_max_monthly_cost_cap_usd}
                                                    step="0.01"
                                                    value={copilotCostCap}
                                                    onChange={(e) => setCopilotCostCap(e.target.value)}
                                                    placeholder="No cap"
                                                />
                                            </div>
                                            <div className="form-group">
                                                <label className="form-label">Per-user daily limit (blank = no limit)</label>
                                                <input
                                                    className="input"
                                                    type="number"
                                                    min={0}
                                                    value={copilotDailyUserLimit}
                                                    onChange={(e) => setCopilotDailyUserLimit(e.target.value)}
                                                    placeholder="No limit"
                                                />
                                            </div>
                                            <button
                                                type="button"
                                                className="btn btn--primary btn--sm"
                                                onClick={() => void saveCopilotQuota()}
                                                disabled={copilotQuotaSaving}
                                            >
                                                {copilotQuotaSaved ? "Saved" : copilotQuotaSaving ? "Saving…" : "Save copilot limits"}
                                            </button>
                                        </div>
                                    ) : (
                                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                            Contact an organization admin to adjust copilot quotas.
                                        </p>
                                    )}
                                </div>
                            )}

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
                                            : "Custom policy evaluation during scans requires Claude to be configured by your administrator."}
                                    </div>
                                </div>
                            </div>

                            {showDevDiagnostics ? (
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-3)", lineHeight: 1.5 }}>
                                    To change the provider locally, set <code style={{ fontFamily: "monospace" }}>COPILOT_PROVIDER</code> in the backend environment and restart the server.
                                </p>
                            ) : (
                                <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginTop: "var(--s-3)", lineHeight: 1.5 }}>
                                    AI provider configuration is managed by your platform administrator.
                                </p>
                            )}
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
                        Preferences are saved in this browser. Email and webhook delivery can be configured by your administrator via Slack.
                    </p>
                </SectionCard>

                {showDevDiagnostics && (
                    <SectionCard>
                        <SectionHeader
                            icon={<LinkOutlinedIcon sx={{ fontSize: 24 }} />}
                            title="Developer diagnostics"
                            subtitle="Local development connection details"
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
                            value={isFirebaseConfigured ? "Configured" : "Not configured"}
                        />
                        {backendStatus && (
                            <>
                                <SettingRow label="Backend environment" value={`${backendStatus.app_env} — v${backendStatus.app_version}`} />
                                <SettingRow label="Rate limit" value={`${backendStatus.rate_limit_per_minute} requests / minute`} />
                            </>
                        )}
                    </SectionCard>
                )}

                {/* ── 8. About ─────────────────────────────────────────────── */}
                <SectionCard>
                    <SectionHeader
                        icon={<InfoOutlinedIcon sx={{ fontSize: 24 }} />}
                        title="About TrustFabric"
                    />
                    <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-secondary)", lineHeight: 1.7, marginBottom: "var(--s-4)" }}>
                        TrustFabric helps enterprise security and compliance teams govern AI systems end to end — from inventory and policy enforcement to audit-ready evidence aligned with NIST AI RMF.
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
        </main>
    );
}
