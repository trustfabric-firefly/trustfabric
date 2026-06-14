"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { LinkOutlinedIcon, OpenInNewOutlinedIcon, SearchOutlinedIcon } from "@/lib/icons";
import { useScanIntegrationsEnabled } from "@/hooks/useScanIntegrationsEnabled";
import {
    SCAN_INTEGRATIONS,
    type ScanAppId,
    type ScanIntegrationDef,
} from "@/lib/scan-integrations";

type ConnectionMap = Record<ScanAppId, boolean>;

const CATEGORIES = ["All integrations", "Developer tools", "Cloud", "Design"] as const;

type IntegrationsHubProps = {
    connected: ConnectionMap;
};

export function IntegrationsHub({ connected }: IntegrationsHubProps) {
    const router = useRouter();
    const { enabled, toggle } = useScanIntegrationsEnabled();
    const [activeCategory, setActiveCategory] = useState<(typeof CATEGORIES)[number]>("All integrations");
    const [search, setSearch] = useState("");

    const filtered = useMemo(() => {
        return SCAN_INTEGRATIONS.filter((item) => {
            const matchesCategory =
                activeCategory === "All integrations" || item.category === activeCategory;
            const q = search.trim().toLowerCase();
            const matchesSearch =
                !q ||
                item.name.toLowerCase().includes(q) ||
                item.description.toLowerCase().includes(q) ||
                item.url.toLowerCase().includes(q);
            return matchesCategory && matchesSearch;
        });
    }, [activeCategory, search]);

    const openScans = (id: ScanAppId) => {
        if (!enabled[id]) return;
        router.push(`/scans?app=${id}`);
    };

    return (
        <div className="integrations-hub">
            <header className="integrations-hub__intro">
                <h2 className="integrations-hub__title">Integrations and connected apps</h2>
                <p className="integrations-hub__subtitle">
                    Supercharge your workflow — run compliance scans across GitHub, AWS, and Figma from one place.
                </p>
            </header>

            <div className="integrations-hub__toolbar">
                <div className="integrations-hub__tabs" role="tablist" aria-label="Integration categories">
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            type="button"
                            role="tab"
                            aria-selected={activeCategory === cat}
                            className={`integrations-hub__tab${activeCategory === cat ? " active" : ""}`}
                            onClick={() => setActiveCategory(cat)}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
                <label className="integrations-hub__search">
                    <SearchOutlinedIcon sx={{ fontSize: 18, color: "var(--c-text-muted)" }} />
                    <input
                        type="search"
                        placeholder="Search"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        aria-label="Search integrations"
                    />
                </label>
            </div>

            <div className="integrations-hub__grid">
                {filtered.map((item) => (
                    <IntegrationCard
                        key={item.id}
                        item={item}
                        connected={connected[item.id]}
                        enabled={enabled[item.id]}
                        onToggle={() => toggle(item.id)}
                        onViewScans={() => openScans(item.id)}
                    />
                ))}
            </div>

            {filtered.length === 0 && (
                <p style={{ textAlign: "center", color: "var(--c-text-muted)", padding: "var(--s-8) 0" }}>
                    No integrations match your search.
                </p>
            )}
        </div>
    );
}

function IntegrationLogo({ item }: { item: ScanIntegrationDef }) {
    const isAws = item.id === "aws";
    const imgClass = `integration-card__logo-img${isAws ? " integration-card__logo-img--aws" : ""}`;
    const width = isAws ? 40 : 28;
    const height = isAws ? 24 : 28;

    return (
        <div className="integration-card__logo" aria-hidden>
            <img
                src={item.logoSrc}
                alt=""
                className={`${imgClass} integration-card__logo-img--light`}
                width={width}
                height={height}
                loading="lazy"
                decoding="async"
            />
            <img
                src={item.logoSrcDark}
                alt=""
                className={`${imgClass} integration-card__logo-img--dark`}
                width={width}
                height={height}
                loading="lazy"
                decoding="async"
            />
        </div>
    );
}

function IntegrationCard({
    item,
    connected,
    enabled,
    onToggle,
    onViewScans,
}: {
    item: ScanIntegrationDef;
    connected: boolean;
    enabled: boolean;
    onToggle: () => void;
    onViewScans: () => void;
}) {
    return (
        <article className={`integration-card${!enabled ? " integration-card--disabled" : ""}`}>
            <div className="integration-card__head">
                <div className="integration-card__meta">
                    <h3 className="integration-card__name">{item.name}</h3>
                    <a
                        href={`https://${item.url}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="integration-card__url"
                    >
                        {item.url}
                        <OpenInNewOutlinedIcon sx={{ fontSize: 12 }} />
                    </a>
                </div>
                <IntegrationLogo item={item} />
            </div>
            <div className="integration-card__body">
                <p className="integration-card__desc">{item.description}</p>
                <span className="integration-card__status">
                    <span
                        className={`integration-card__status-dot${connected ? " integration-card__status-dot--live" : ""}`}
                    />
                    {connected ? "Connected" : "Not connected"}
                </span>
            </div>
            <footer className="integration-card__footer">
                <button
                    type="button"
                    className="integration-card__view-btn"
                    onClick={onViewScans}
                    disabled={!enabled}
                >
                    <LinkOutlinedIcon sx={{ fontSize: 14, marginRight: 6 }} />
                    View scans
                </button>
                <div className="integration-card__toggle-wrap">
                    <span className="integration-card__toggle-label" aria-hidden>
                        {enabled ? "On" : "Off"}
                    </span>
                    <button
                        type="button"
                        className={`integration-toggle${enabled ? " integration-toggle--on" : " integration-toggle--off"}`}
                        onClick={onToggle}
                        role="switch"
                        aria-checked={enabled}
                        aria-label={`${enabled ? "Disable" : "Enable"} ${item.name} scans`}
                    >
                        <span className="integration-toggle__thumb" />
                    </button>
                </div>
            </footer>
        </article>
    );
}
