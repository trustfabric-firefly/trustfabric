"use client";

import { useEffect } from "react";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

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
            <h1 style={{ fontSize: "var(--fs-24)", fontWeight: "var(--fw-bold)", color: "var(--c-text)", margin: 0 }}>Something went wrong</h1>
            <p style={{ fontSize: "var(--fs-14)", color: "var(--c-text-muted)", margin: 0 }}>{error.message || "An unexpected error occurred."}</p>
            <button className="btn btn--primary" onClick={reset}>Try again</button>
        </div>
    );
}
