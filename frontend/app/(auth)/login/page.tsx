"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/providers/AuthProvider";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";

export default function LoginPage() {
    const { signIn, isDevMode } = useAuth();
    const router = useRouter();
    const [email, setEmail] = useState("");
    const [password, setPassword] = useState("");
    const [error, setError] = useState("");
    const [loading, setLoading] = useState(false);

    const handleSubmit = async (e: FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);
        try {
            await signIn(email, password);
            if (typeof window !== "undefined") {
                if (isDevMode) {
                    window.localStorage.setItem("trustfabric_api_token", password.trim());
                } else {
                    window.localStorage.removeItem("trustfabric_api_token");
                }
            }
            const raw =
                typeof window !== "undefined"
                    ? new URLSearchParams(window.location.search).get("returnTo")
                    : null;
            const returnTo =
                raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/dashboard";
            router.push(returnTo);
        } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Sign in failed.");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div style={{
            minHeight: "100vh",
            background: "var(--c-bg)",
            backgroundImage: "var(--c-bg-gradient)",
            display: "flex", alignItems: "center", justifyContent: "center",
            padding: "var(--s-4)",
        }}>
            <div style={{ width: "100%", maxWidth: 380 }}>
                {/* Logo */}
                <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-8)", justifyContent: "center" }}>
                    <div style={{
                        width: 36, height: 36,
                        background: "var(--c-accent)", borderRadius: "var(--r-md)",
                        display: "flex", alignItems: "center", justifyContent: "center",
                        color: "var(--c-text-inverse)",
                    }}>
                        <VerifiedUserOutlinedIcon sx={{ fontSize: 22 }} />
                    </div>
                    <span style={{ fontSize: "var(--fs-20)", fontWeight: "var(--fw-bold)", color: "var(--c-text)", letterSpacing: "-0.02em" }}>
                        TrustFabric
                    </span>
                </div>

                <div className="panel" style={{ padding: "var(--s-6)" }}>
                    <h1 style={{ fontSize: "var(--fs-18)", fontWeight: "var(--fw-semibold)", marginBottom: 2 }}>Sign in</h1>
                    <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)", marginBottom: "var(--s-5)" }}>
                        Access your AI governance dashboard
                    </p>

                    <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
                        <div className="form-group">
                            <label className="form-label" htmlFor="email">Email</label>
                            <input id="email" type="email" className="input" placeholder="you@company.com"
                                value={email} onChange={(e) => setEmail(e.target.value)} required autoComplete="email" />
                        </div>
                        <div className="form-group">
                            <label className="form-label" htmlFor="password">Password</label>
                            <input id="password" type="password" className="input" placeholder="--------"
                                value={password} onChange={(e) => setPassword(e.target.value)} required autoComplete="current-password" />
                        </div>
                        {error && <div className="alert alert--danger" style={{ fontSize: "var(--fs-11)" }}>{error}</div>}
                        <button type="submit" className="btn btn--primary btn--lg" disabled={loading}
                            style={{ width: "100%", justifyContent: "center", marginTop: "var(--s-1)" }}>
                            {loading ? "Signing in..." : "Sign in"}
                        </button>
                    </form>
                </div>

                <p style={{ textAlign: "center", marginTop: "var(--s-5)", fontSize: "var(--fs-11)", color: "var(--c-text-muted)" }}>
                    NIST AI RMF-aligned governance
                </p>
            </div>
        </div>
    );
}
