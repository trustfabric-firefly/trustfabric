"use client";

interface TopBarProps {
    title: string;
    subtitle?: string;
    actions?: React.ReactNode;
}

import { ThemeToggle } from "@/components/ui/ThemeToggle";

export function TopBar({ title, subtitle, actions }: TopBarProps) {
    return (
        <header className="topbar">
            <div className="topbar__left">
                <h1 className="topbar__title">{title}</h1>
                {subtitle && (
                    <span
                        style={{
                            fontSize: "var(--fs-12)",
                            color: "var(--c-text-muted)",
                            marginLeft: "var(--s-3)",
                            borderLeft: "1px solid var(--c-border)",
                            paddingLeft: "var(--s-3)",
                        }}
                    >
                        {subtitle}
                    </span>
                )}
            </div>
            <div className="topbar__right">
                {actions}
                <ThemeToggle />
            </div>
        </header>
    );
}
