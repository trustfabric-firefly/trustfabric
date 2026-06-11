"use client";
import { DarkModeOutlinedIcon, LightModeOutlinedIcon } from "@/lib/icons";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
export function ThemeToggle() {
    const { theme, setTheme } = useTheme();
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    if (!mounted) {
        return <div style={{ width: 32, height: 32 }} />;
    }

    return (
        <button
            type="button"
            className="btn btn--ghost"
            style={{ padding: 6, borderRadius: "50%" }}
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
        >
            {theme === "dark" ? (
                <LightModeOutlinedIcon sx={{ fontSize: 20 }} />
            ) : (
                <DarkModeOutlinedIcon sx={{ fontSize: 20 }} />
            )}
        </button>
    );
}
