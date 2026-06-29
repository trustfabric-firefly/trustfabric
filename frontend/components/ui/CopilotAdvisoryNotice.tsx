"use client";

import { InfoOutlinedIcon } from "@/lib/icons";

import { COPILOT_ADVISORY_DISCLAIMER, resolveCopilotDisclaimer } from "@/lib/copilot-disclaimer";

type CopilotAdvisoryNoticeProps = {
    text?: string | null;
    className?: string;
    style?: React.CSSProperties;
};

export function CopilotAdvisoryNotice({
    text,
    className,
    style,
}: CopilotAdvisoryNoticeProps) {
    const message = text === undefined ? COPILOT_ADVISORY_DISCLAIMER : resolveCopilotDisclaimer(text);

    return (
        <div
            className={className}
            role="note"
            aria-label="Advisory notice"
            style={{
                display: "flex",
                gap: "var(--s-2)",
                alignItems: "flex-start",
                padding: "var(--s-3)",
                borderRadius: "var(--r-md)",
                border: "1px solid var(--c-border)",
                background: "var(--c-surface-raised)",
                fontSize: "var(--fs-12)",
                color: "var(--c-text-muted)",
                lineHeight: 1.5,
                ...style,
            }}
        >
            <InfoOutlinedIcon sx={{ fontSize: 16, marginTop: "2px", flexShrink: 0 }} aria-hidden />
            <span>{message}</span>
        </div>
    );
}
