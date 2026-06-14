"use client";

import { Icon } from "@iconify/react";
import type { CSSProperties, ComponentType } from "react";
import { registerIconCollections } from "./icon-registry";

registerIconCollections();

export type AppIconProps = {
    /** MUI-compatible props — fontSize/color plus any CSS values (e.g. mt, marginTop). */
    sx?: { fontSize?: number | string; color?: string } & Record<string, string | number | undefined>;
    className?: string;
    style?: CSSProperties;
};

const SX_SHORTHAND: Record<string, keyof CSSProperties> = {
    mt: "marginTop",
    mb: "marginBottom",
    ml: "marginLeft",
    mr: "marginRight",
};

function sxToStyle(sx?: AppIconProps["sx"]): CSSProperties {
    if (!sx) return {};
    const { fontSize: _f, color, ...rest } = sx;
    const out: Record<string, string | number> = {};
    if (color != null) out.color = color;
    for (const [key, value] of Object.entries(rest)) {
        if (value == null) continue;
        const cssKey = SX_SHORTHAND[key] ?? key;
        out[cssKey] = value;
    }
    return out as CSSProperties;
}

export type AppIconComponent = ComponentType<AppIconProps>;

type CreateIconOptions = {
    displayName?: string;
    /** Iconify collection prefix — defaults to streamline-flex (Flex Line). */
    pack?: string;
    rotate?: number;
};

function resolveSize(sx?: AppIconProps["sx"]): number {
    const raw = sx?.fontSize ?? 24;
    if (typeof raw === "number") return raw;
    const parsed = parseInt(String(raw), 10);
    return Number.isFinite(parsed) ? parsed : 24;
}

export function createIcon(name: string, opts: CreateIconOptions = {}): AppIconComponent {
    const { displayName = name, pack = "streamline-flex", rotate } = opts;

    const IconComponent = ({ sx, className, style }: AppIconProps) => {
        const size = resolveSize(sx);
        return (
            <Icon
                icon={`${pack}:${name}`}
                width={size}
                height={size}
                className={className}
                style={{
                    color: sx?.color ?? "currentColor",
                    flexShrink: 0,
                    display: "inline-block",
                    verticalAlign: "middle",
                    transform: rotate ? `rotate(${rotate}deg)` : undefined,
                    ...sxToStyle(sx),
                    ...style,
                }}
            />
        );
    };

    IconComponent.displayName = displayName;
    return IconComponent;
}
