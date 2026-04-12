"use client";

import React from "react";

interface AIIconProps {
    className?: string;
    style?: React.CSSProperties;
    size?: number | string;
    // For compatibility with MUI icon props if they are passed through
    sx?: {
        fontSize?: number | string;
        color?: string;
        [key: string]: any;
    };
}

export function AIIcon({ className, style, size, sx }: AIIconProps) {
    const iconSize = size || sx?.fontSize || 16;
    
    return (
        <img
            src="/ai-icon.svg"
            alt="AI"
            className={className}
            style={{
                width: iconSize,
                height: iconSize,
                display: "inline-block",
                verticalAlign: "middle",
                filter: "var(--ai-icon-filter)",
                ...style,
            }}
        />
    );
}

// For use in MUI data structures that expect a component type
export const AIIconWrapper = (props: any) => <AIIcon {...props} />;
