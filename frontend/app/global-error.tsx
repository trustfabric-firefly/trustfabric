"use client";

import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
    useEffect(() => {
        console.error(error);
    }, [error]);

    return (
        <html lang="en">
            <body style={{
                margin: 0,
                minHeight: "100vh",
                background: "#0f0f0f",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                flexDirection: "column",
                gap: "16px",
                fontFamily: "sans-serif",
                color: "#fff",
                padding: "16px",
            }}>
                <h1 style={{ fontSize: 24, fontWeight: 700, margin: 0 }}>Something went wrong</h1>
                <p style={{ fontSize: 14, color: "#aaa", margin: 0 }}>{error.message || "A critical error occurred."}</p>
                <button
                    onClick={reset}
                    style={{ padding: "8px 20px", background: "#2563eb", color: "#fff", border: "none", borderRadius: 6, cursor: "pointer", fontSize: 14 }}
                >
                    Try again
                </button>
            </body>
        </html>
    );
}
