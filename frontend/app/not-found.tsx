"use client";

import Link from "next/link";

export default function NotFound() {
    return (
        <div style={{
            minHeight: "100vh",
            background: "var(--c-bg)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexDirection: "column",
            gap: "var(--s-4)",
            padding: "var(--s-4)",
        }}>
            <h1 style={{ fontSize: "var(--fs-48)", fontWeight: "var(--fw-bold)", color: "var(--c-text)", margin: 0 }}>404</h1>
            <p style={{ fontSize: "var(--fs-16)", color: "var(--c-text-muted)", margin: 0 }}>This page does not exist.</p>
            <Link href="/dashboard" className="btn btn--primary">Go to Dashboard</Link>
        </div>
    );
}
