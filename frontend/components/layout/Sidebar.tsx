"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import MemoryOutlinedIcon from "@mui/icons-material/MemoryOutlined";
import PolicyOutlinedIcon from "@mui/icons-material/PolicyOutlined";
import DocumentScannerOutlinedIcon from "@mui/icons-material/DocumentScannerOutlined";
import HistoryOutlinedIcon from "@mui/icons-material/HistoryOutlined";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import LogoutOutlinedIcon from "@mui/icons-material/LogoutOutlined";
import VerifiedUserOutlinedIcon from "@mui/icons-material/VerifiedUserOutlined";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import { useAuth } from "@/providers/AuthProvider";

import { motion } from "motion/react";

const NAV = [
    {
        section: "General", items: [
            { label: "Dashboard", href: "/dashboard", icon: DashboardOutlinedIcon },
        ]
    },
    {
        section: "Governance", items: [
            { label: "AI Systems", href: "/systems", icon: MemoryOutlinedIcon },
            { label: "Policies", href: "/policies", icon: PolicyOutlinedIcon },
            { label: "Brand Compliance", href: "/brand-compliance", icon: BrushOutlinedIcon },
            { label: "Scans", href: "/scans", icon: DocumentScannerOutlinedIcon },
            { label: "Compliance", href: "/compliance", icon: VerifiedUserOutlinedIcon },
            { label: "Audit", href: "/audit", icon: HistoryOutlinedIcon },
        ]
    },
    {
        section: "Others", items: [
            { label: "Settings", href: "/settings", icon: SettingsOutlinedIcon },
        ]
    },
];

export function Sidebar() {
    const pathname = usePathname();
    const { user, logOut, isDevMode } = useAuth();

    const initials = user?.email
        ? user.email.slice(0, 2).toUpperCase()
        : "TF";

    return (
        <aside className="sidebar">
            {/* Logo */}
            <div className="sidebar__logo" style={{ gap: "12px" }}>
                <img src="/logo.svg" alt="TrustFabric Logo" width={34} height={34} />
                <span className="sidebar__logo-text">TrustFabric</span>
            </div>

            {/* Navigation */}
            <nav className="sidebar__nav">
                {NAV.map(({ section, items }) => (
                    <div key={section}>
                        <span className="sidebar__section-label">{section}</span>
                        {items.map(({ label, href, icon: Icon }) => {
                            const isActive = pathname === href || pathname.startsWith(`${href}/`);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    prefetch={true}
                                    className={`sidebar__link${isActive ? " active" : ""}`}
                                >
                                    {isActive && (
                                        <>
                                            <motion.span
                                                layoutId="active-well"
                                                className="sidebar__active-well"
                                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                            />
                                            <motion.span
                                                layoutId="active-gold-ring"
                                                className="sidebar__active-ring-container"
                                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                            >
                                                <span className="sidebar__active-ring-spin" />
                                            </motion.span>
                                            <motion.span
                                                layoutId="active-inner-ring"
                                                className="sidebar__active-inner"
                                                transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                            />
                                        </>
                                    )}
                                    <span className="sidebar__link-content">
                                        <Icon sx={{ fontSize: 18 }} />
                                        <span>{label}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            {/* User footer */}
            <div className="sidebar__footer">
                <div
                    className="sidebar__user"
                    onClick={logOut}
                    title="Sign out"
                >
                    <div className="sidebar__avatar">{initials}</div>
                    <div className="sidebar__user-info">
                        <div className="sidebar__user-name">{user?.email ?? "Local dev"}</div>
                        <div className="sidebar__user-role">Sign out</div>
                    </div>
                    <LogoutOutlinedIcon sx={{ fontSize: 14, color: "var(--c-text-muted)" }} />
                </div>
            </div>
        </aside>
    );
}
