"use client";

import type { ReactNode } from "react";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

interface TopBarProps {
    title: string;
    subtitle?: ReactNode;
    actions?: ReactNode;
}

export function TopBar({ title, subtitle, actions }: TopBarProps) {
    return (
        <header className="topbar">
            <div className="topbar__left">
                <h1 className="topbar__title">{title}</h1>
                {subtitle && (
                    <div
                        className="topbar__subtitle"
                        style={{
                            fontSize: "var(--fs-12)",
                            color: "var(--c-text-muted)",
                            marginLeft: "var(--s-3)",
                            borderLeft: "1px solid var(--c-border)",
                            paddingLeft: "var(--s-3)",
                        }}
                    >
                        {subtitle}
                    </div>
                )}
            </div>
            <div className="topbar__right">
                {actions}
                <ThemeToggle />
            </div>
        </header>
    );
}
