"use client";
import { LogoutOutlinedIcon } from "@/lib/icons";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { useAuth } from "@/providers/AuthProvider";
import { useOrganization } from "@/providers/OrganizationProvider";
import { APP_MAIN_NAV } from "@/lib/navigation";
import { usePrefetchAppRoutes } from "@/hooks/usePrefetchAppRoutes";

export function Sidebar() {
    const pathname = usePathname();
    const router = useRouter();
    const { user, logOut, isDevMode } = useAuth();
    const { activeOrganization } = useOrganization();
    usePrefetchAppRoutes();

    const handleSignOut = async () => {
        await logOut();
        router.replace("/login");
    };

    const initials = user?.email
        ? user.email.slice(0, 2).toUpperCase()
        : "TF";

    return (
        <aside className="sidebar">
            <div className="sidebar__logo" style={{ gap: "12px" }}>
                <img src="/logo.svg" alt="TrustFabric Logo" width={34} height={34} />
                <span className="sidebar__logo-text">TrustFabric</span>
            </div>

            <nav className="sidebar__nav">
                {APP_MAIN_NAV.map(({ section, items }) => (
                    <div key={section}>
                        <span className="sidebar__section-label">{section}</span>
                        {items.map(({ label, href, icon: Icon }) => {
                            const isActive = pathname === href || pathname.startsWith(`${href}/`);
                            return (
                                <Link
                                    key={href}
                                    href={href}
                                    prefetch
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
                                        <Icon sx={{ fontSize: 20 }} />
                                        <span>{label}</span>
                                    </span>
                                </Link>
                            );
                        })}
                    </div>
                ))}
            </nav>

            <div className="sidebar__footer">
                <div className="sidebar__user">
                    <div className="sidebar__avatar">{initials}</div>
                    <div className="sidebar__user-info">
                        <div className="sidebar__user-name">
                            {isDevMode ? "Development session" : (user?.email ?? "Account")}
                        </div>
                        <div className="sidebar__user-role">
                            {activeOrganization?.organization.name ?? "Workspace"}
                            {activeOrganization?.role ? ` · ${activeOrganization.role}` : ""}
                        </div>
                    </div>
                </div>
                <button
                    type="button"
                    className="sidebar__sign-out"
                    onClick={() => void handleSignOut()}
                    aria-label="Sign out"
                >
                    <LogoutOutlinedIcon sx={{ fontSize: 16 }} />
                    Sign out
                </button>
            </div>
        </aside>
    );
}
