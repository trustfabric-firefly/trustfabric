import { DashboardOutlinedIcon, MemoryOutlinedIcon, PolicyOutlinedIcon, DocumentScannerOutlinedIcon, HistoryOutlinedIcon, SettingsOutlinedIcon, VerifiedUserOutlinedIcon, BrushOutlinedIcon } from "@/lib/icons";
import type { ElementType } from "react";
type NavIcon = ElementType<{ sx?: { fontSize?: number | string } }>;

export type NavItem = { label: string; href: string; icon: NavIcon };

export type NavSection = { section: string; items: readonly NavItem[] };

/** Main app nav — single source of truth for the sidebar and route prefetch. */
export const APP_MAIN_NAV: readonly NavSection[] = [
    {
        section: "General",
        items: [{ label: "Dashboard", href: "/dashboard", icon: DashboardOutlinedIcon }],
    },
    {
        section: "Governance",
        items: [
            { label: "AI Systems", href: "/systems", icon: MemoryOutlinedIcon },
            { label: "Policies", href: "/policies", icon: PolicyOutlinedIcon },
            { label: "Brand Compliance", href: "/brand-compliance", icon: BrushOutlinedIcon },
            { label: "Scans", href: "/scans", icon: DocumentScannerOutlinedIcon },
            { label: "Compliance", href: "/compliance", icon: VerifiedUserOutlinedIcon },
            { label: "Audit", href: "/audit", icon: HistoryOutlinedIcon },
        ],
    },
    {
        section: "Others",
        items: [{ label: "Settings", href: "/settings", icon: SettingsOutlinedIcon }],
    },
] as const;

const hrefs: string[] = [];
for (const { items } of APP_MAIN_NAV) {
    for (const { href } of items) {
        hrefs.push(href);
    }
}

/** Flat list of all primary sidebar routes (for `router.prefetch`). */
export const APP_MAIN_NAV_HREFS: readonly string[] = hrefs;
