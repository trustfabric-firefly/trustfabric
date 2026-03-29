"use client";

import { useCallback, useState } from "react";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import ContentCopyOutlinedIcon from "@mui/icons-material/ContentCopyOutlined";
import CheckOutlinedIcon from "@mui/icons-material/CheckOutlined";
import { TopBar } from "@/components/layout/TopBar";
import { useAuth } from "@/providers/AuthProvider";
import { RESOLVED_API_BASE_URL } from "@/lib/api";
import { isFirebaseConfigured } from "@/lib/firebase";

function SettingRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
    return (
        <div style={{ marginBottom: "var(--s-3)" }}>
            <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginBottom: 4 }}>{label}</div>
            <div
                style={{
                    fontSize: "var(--fs-13)",
                    wordBreak: "break-all",
                    fontFamily: mono ? "ui-monospace, monospace" : undefined,
                }}
            >
                {value}
            </div>
        </div>
    );
}

export default function SettingsPage() {
    const { user, isDevMode, logOut, loading } = useAuth();
    const [copied, setCopied] = useState(false);

    const authModeLabel = isDevMode ? "Local dev (Firebase web config not set)" : "Firebase Authentication";
    const hasDevBearer =
        Boolean(process.env.NEXT_PUBLIC_DEV_ADMIN_TOKEN) || Boolean(process.env.NEXT_PUBLIC_DEV_VIEWER_TOKEN);

    const copyApiUrl = useCallback(() => {
        void navigator.clipboard.writeText(RESOLVED_API_BASE_URL).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    }, []);

    return (
        <div style={{ padding: "var(--s-4)", minHeight: "100%" }}>
            <TopBar title="Settings" subtitle="Account and connection" actions={null} />

            <div style={{ marginTop: "var(--s-6)", display: "flex", flexDirection: "column", gap: "var(--s-4)", maxWidth: 640 }}>
                <section
                    style={{
                        padding: "var(--s-5)",
                        borderRadius: "var(--r-md)",
                        border: "1px solid var(--c-border)",
                        background: "var(--c-surface-elevated)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", marginBottom: "var(--s-4)" }}>
                        <SettingsOutlinedIcon sx={{ fontSize: 28, color: "var(--c-text-muted)" }} />
                        <div>
                            <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-15)" }}>Account</div>
                            <div style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-12)", marginTop: 2 }}>
                                {authModeLabel}
                            </div>
                        </div>
                    </div>

                    <SettingRow label="Email" value={user?.email ?? (isDevMode ? "dev@local (stub)" : "—")} />
                    <SettingRow label="User ID" value={user?.uid ?? "—"} mono />

                    {!isDevMode && (
                        <button
                            type="button"
                            className="btn btn--secondary"
                            style={{ marginTop: "var(--s-2)", display: "inline-flex", alignItems: "center", gap: 8 }}
                            disabled={loading}
                            onClick={() => void logOut()}
                        >
                            <LogoutOutlinedIcon sx={{ fontSize: 18 }} />
                            Sign out
                        </button>
                    )}
                    {isDevMode && (
                        <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", margin: "var(--s-2) 0 0", lineHeight: 1.5 }}>
                            Sign out is hidden in this mode; the app uses a stub user when Firebase env vars are unset.
                        </p>
                    )}
                </section>

                <section
                    style={{
                        padding: "var(--s-5)",
                        borderRadius: "var(--r-md)",
                        border: "1px solid var(--c-border)",
                        background: "var(--c-surface-elevated)",
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-4)" }}>
                        <LinkOutlinedIcon sx={{ fontSize: 22, color: "var(--c-text-muted)" }} />
                        <div style={{ fontWeight: "var(--fw-semibold)", fontSize: "var(--fs-15)" }}>API connection</div>
                    </div>

                    <SettingRow label="API base URL" value={RESOLVED_API_BASE_URL} mono />
                    <button
                        type="button"
                        className="btn btn--ghost btn--sm"
                        style={{ gap: 6 }}
                        onClick={copyApiUrl}
                    >
                        {copied ? <CheckOutlinedIcon sx={{ fontSize: 16 }} /> : <ContentCopyOutlinedIcon sx={{ fontSize: 16 }} />}
                        {copied ? "Copied" : "Copy URL"}
                    </button>

                    <SettingRow
                        label="Firebase client"
                        value={isFirebaseConfigured ? "Configured (NEXT_PUBLIC_FIREBASE_API_KEY set)" : "Not configured — using dev stub user"}
                    />
                    <SettingRow
                        label="Dev bearer token (env)"
                        value={
                            hasDevBearer
                                ? "Set — used when no Firebase session (NEXT_PUBLIC_DEV_ADMIN_TOKEN or NEXT_PUBLIC_DEV_VIEWER_TOKEN)"
                                : "Not set — API calls need Firebase sign-in or a token in localStorage"
                        }
                    />
                </section>
            </div>
        </div>
    );
}
