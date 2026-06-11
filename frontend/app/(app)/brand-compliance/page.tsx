"use client";
import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import BrushOutlinedIcon from "@mui/icons-material/BrushOutlined";
import CheckCircleOutlinedIcon from "@mui/icons-material/CheckCircleOutlined";
import ErrorOutlineOutlinedIcon from "@mui/icons-material/ErrorOutlineOutlined";
import WarningAmberOutlinedIcon from "@mui/icons-material/WarningAmberOutlined";
import LinkOutlinedIcon from "@mui/icons-material/LinkOutlined";
import SearchOutlinedIcon from "@mui/icons-material/SearchOutlined";
import { TopBar } from "@/components/layout/TopBar";
import { figmaApi, brandComplianceApi, type FigmaFrame, type BrandComplianceResult, type FigmaScanResult } from "@/lib/api";

type ScanState = "idle" | "loading-frames" | "scanning" | "done";

export default function BrandCompliancePage() {
    const [fileUrl, setFileUrl] = useState("https://www.figma.com/files/team/1631423113293559422/project/594252304?fuid=1610878785316337426");
    const [frames, setFrames] = useState<FigmaFrame[]>([]);
    const [selected, setSelected] = useState<Set<string>>(new Set());
    const [scanState, setScanState] = useState<ScanState>("idle");
    const [scanResult, setScanResult] = useState<FigmaScanResult | null>(null);
    const [error, setError] = useState("");

    const { data: figmaStatus } = useQuery({
        queryKey: ["figma-status"], queryFn: figmaApi.status, retry: false,
    });

    const extractIds = (url: string) => {
        const fileMatch = url.match(/figma\.com\/(?:design|file)\/([a-zA-Z0-9]+)/);
        if (fileMatch) return { type: "file", id: fileMatch[1] };
        const projectMatch = url.match(/figma\.com\/files\/team\/[0-9]+\/project\/([0-9]+)/);
        if (projectMatch) return { type: "project", id: projectMatch[1] };
        const raw = url.trim();
        if (raw.length > 5 && !raw.includes("/")) {
            return { type: /^\d+$/.test(raw) ? "project" : "file", id: raw };
        }
        return null;
    };

    const handleFetchFrames = useCallback(async () => {
        const target = extractIds(fileUrl);
        if (!target) { setError("Paste a valid Figma file or project URL"); return; }
        
        setError(""); setScanState("loading-frames"); setScanResult(null);
        try {
            let fileKey = target.id;
            
            // If user pasted a project URL, fetch the files and try to find all design files
            if (target.type === "project") {
                const projRes = await figmaApi.projectFiles(target.id);
                if (!projRes.files || projRes.files.length === 0) {
                    throw new Error("No files found in this project");
                }
                
                let allFrames: FigmaFrame[] = [];
                for (const f of projRes.files) {
                    try {
                        const res = await figmaApi.fileFrames(f.key);
                        if (res.frames && res.frames.length > 0) {
                            allFrames = [...allFrames, ...res.frames];
                        }
                    } catch (e) {
                        // Skip files that fail (e.g. FigJam or unsupported endpoints)
                    }
                }
                
                if (allFrames.length === 0) {
                    throw new Error("Could not find any supported design frames in this project");
                }
                setFrames(allFrames);
                setSelected(new Set(allFrames.map(f => `${f.file_key}:${f.id}`)));
                setScanState("idle");
                return;
            }

            const res = await figmaApi.fileFrames(target.id);
            setFrames(res.frames);
            setSelected(new Set(res.frames.map(f => `${f.file_key}:${f.id}`)));
            setScanState("idle");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Failed to fetch frames");
            setScanState("idle");
        }
    }, [fileUrl]);

    const handleScan = useCallback(async () => {
        if (frames.length === 0 || selected.size === 0) return;
        setScanState("scanning"); setError("");
        try {
            // Group selected frames by file_key to support project-wide scanning
            const selectedFrames = frames.filter(f => selected.has(`${f.file_key}:${f.id}`));
            const byFile = selectedFrames.reduce((acc, f) => {
                if (!acc[f.file_key]) acc[f.file_key] = [];
                acc[f.file_key].push(f.id);
                return acc;
            }, {} as Record<string, string[]>);

            const fileKeys = Object.keys(byFile);
            const scanPromises = fileKeys.map(k => figmaApi.batchScan(k, byFile[k]));
            const results = await Promise.all(scanPromises);

            // Merge results
            const mergedResult: FigmaScanResult = {
                results: results.flatMap(r => r.results),
                summary: {
                    total: results.reduce((acc, r) => acc + r.summary.total, 0),
                    scanned: results.reduce((acc, r) => acc + r.summary.scanned, 0),
                    errors: results.reduce((acc, r) => acc + r.summary.errors, 0),
                    compliant: results.reduce((acc, r) => acc + r.summary.compliant, 0),
                    needs_review: results.reduce((acc, r) => acc + r.summary.needs_review, 0),
                    non_compliant: results.reduce((acc, r) => acc + r.summary.non_compliant, 0),
                    average_score: 0,
                }
            };
            
            // Calculate weighted average score
            const totalScoreSum = results.reduce((acc, r) => acc + (r.summary.average_score * r.summary.scanned), 0);
            mergedResult.summary.average_score = mergedResult.summary.scanned > 0 
                ? Math.round(totalScoreSum / mergedResult.summary.scanned) 
                : 0;

            setScanResult(mergedResult); 
            setScanState("done");
        } catch (e) {
            setError(e instanceof Error ? e.message : "Scan failed");
            setScanState("done");
        }
    }, [frames, selected]);

    const toggleSelect = (compKey: string) => {
        setSelected(prev => { const n = new Set(prev); n.has(compKey) ? n.delete(compKey) : n.add(compKey); return n; });
    };
    const toggleAll = () => {
        setSelected(prev => prev.size === frames.length ? new Set() : new Set(frames.map(f => `${f.file_key}:${f.id}`)));
    };

    const connected = figmaStatus?.connected;

    return (
        <>
            <TopBar title="Brand Compliance Scanner" subtitle="Analyze Figma design assets against brand guidelines" />
            <main className="page">
                {/* Connection Status */}
                <div className="panel" style={{ marginBottom: "var(--s-4)" }}>
                    <div className="panel__body" style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", padding: "var(--s-3) var(--s-4)" }}>
                        <img src="https://upload.wikimedia.org/wikipedia/commons/thumb/3/33/Figma-logo.svg/1920px-Figma-logo.svg.png" alt="Figma" style={{ width: 20, height: 28, objectFit: "contain" }} />
                        <div style={{ flex: 1 }}>
                            <div style={{ fontSize: "var(--fs-14)", fontWeight: "var(--fw-semibold)" }}>Figma</div>
                            <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
                                {connected ? `Connected as ${figmaStatus?.user?.handle} (${figmaStatus?.user?.email})` : "Not connected — add FIGMA_TOKEN to .env"}
                            </div>
                        </div>
                        <span className={`badge badge--${connected ? "success" : "danger"}`}>{connected ? "Connected" : "Disconnected"}</span>
                    </div>
                </div>

                {/* File URL Input */}
                {connected && (
                    <div className="panel" style={{ marginBottom: "var(--s-4)" }}>
                        <div className="panel__header"><span className="panel__title"><LinkOutlinedIcon sx={{ fontSize: 16 }} /> Load Figma File</span></div>
                        <div className="panel__body">
                            <div style={{ display: "flex", gap: "var(--s-2)" }}>
                                <input
                                    type="text" className="input" placeholder="e.g. https://www.figma.com/files/team/1631423113293559422/project/594252304..."
                                    value={fileUrl} onChange={e => setFileUrl(e.target.value)}
                                    onKeyDown={e => e.key === "Enter" && handleFetchFrames()}
                                    style={{ flex: 1 }}
                                />
                                <button className="btn btn--primary" onClick={handleFetchFrames} disabled={scanState === "loading-frames"}>
                                    {scanState === "loading-frames" ? "Loading..." : "Fetch Designs"}
                                </button>
                            </div>
                            <div style={{ fontSize: "var(--fs-11)", color: "var(--c-text-muted)", marginTop: "var(--s-2)" }}>
                                Paste any Figma file URL. TrustFabric will fetch all frames/artboards and render them for compliance analysis.
                            </div>
                        </div>
                    </div>
                )}

                {/* Frames Grid */}
                {frames.length > 0 && (
                    <div className="panel" style={{ marginBottom: "var(--s-4)" }}>
                        <div className="panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span className="panel__title"><BrushOutlinedIcon sx={{ fontSize: 16 }} /> Design Assets ({frames.length})</span>
                            <div style={{ display: "flex", gap: "var(--s-2)", alignItems: "center" }}>
                                <button className="btn btn--ghost btn--sm" onClick={() => {
                                    setFrames([]); setSelected(new Set()); setScanResult(null); setFileUrl(""); setScanState("idle");
                                }}>
                                    Clear & Restart
                                </button>
                                <button className="btn btn--secondary btn--sm" onClick={toggleAll}>
                                    {selected.size === frames.length ? "Deselect All" : "Select All"}
                                </button>
                                <button className="btn btn--primary btn--sm" onClick={handleScan}
                                    disabled={selected.size === 0 || scanState === "scanning"}>
                                    {scanState === "scanning" ? `Scanning ${selected.size} assets...` : `Scan ${selected.size} Selected`}
                                </button>
                            </div>
                        </div>
                        <div className="panel__body" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))", gap: "var(--s-3)" }}>
                            {frames.map(f => {
                                const compKey = `${f.file_key}:${f.id}`;
                                const isSelected = selected.has(compKey);
                                const result = scanResult?.results.find(r => r.node_id === f.id && frames.find(fr => fr.id === r.node_id)?.file_key === f.file_key);
                                return (
                                    <div key={compKey} onClick={() => toggleSelect(compKey)}
                                        style={{
                                            border: `2px solid ${isSelected ? "var(--c-accent)" : "var(--c-border)"}`,
                                            borderRadius: "var(--radius-md)", overflow: "hidden", cursor: "pointer",
                                            transition: "all 0.15s ease", opacity: isSelected ? 1 : 0.6,
                                            position: "relative",
                                        }}>
                                        {f.thumbnail_url ? (
                                            <img src={f.thumbnail_url} alt={f.name}
                                                style={{ width: "100%", height: 140, objectFit: "cover", display: "block", background: "var(--c-bg-elevated)" }} />
                                        ) : (
                                            <div style={{ width: "100%", height: 140, background: "var(--c-bg-elevated)", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--c-text-muted)", fontSize: "var(--fs-11)" }}>No preview</div>
                                        )}
                                        <div style={{ padding: "8px 10px", borderTop: "1px solid var(--c-border)" }}>
                                            <div style={{ fontSize: "var(--fs-12)", fontWeight: "var(--fw-medium)", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{f.name}</div>
                                            <div style={{ fontSize: "var(--fs-10)", color: "var(--c-text-muted)" }}>{f.page} · {f.type}</div>
                                        </div>
                                        {/* Score overlay */}
                                        {result && result.status === "scanned" && (
                                            <div style={{
                                                position: "absolute", top: 8, right: 8, padding: "2px 8px",
                                                borderRadius: "var(--radius-full)", fontSize: "var(--fs-11)", fontWeight: 700,
                                                background: result.overall_score >= 80 ? "#34d399" : result.overall_score >= 50 ? "#fbbf24" : "#f87171",
                                                color: "#fff",
                                            }}>{result.overall_score}</div>
                                        )}
                                        {isSelected && (
                                            <div style={{ position: "absolute", top: 8, left: 8, width: 20, height: 20, borderRadius: 4, background: "var(--c-accent)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                                                <CheckCircleOutlinedIcon sx={{ fontSize: 14, color: "#fff" }} />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Scan Results Summary */}
                {scanResult && (
                    <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-4)" }}>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: "var(--s-3)" }}>
                            <StatCard label="Average Score" value={`${scanResult.summary.average_score}/100`} />
                            <StatCard label="Compliant" value={scanResult.summary.compliant} />
                            <StatCard label="Needs Review" value={scanResult.summary.needs_review} />
                            <StatCard label="Non-Compliant" value={scanResult.summary.non_compliant} />
                        </div>

                        {/* Per-asset results */}
                        {scanResult.results.filter(r => r.status === "scanned").map(r => (
                            <div key={r.node_id} className="panel">
                                <div className="panel__header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                    <span className="panel__title">
                                        {frames.find(f => f.id === r.node_id)?.name ?? r.node_id}
                                    </span>
                                    <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)" }}>
                                        <span style={{
                                            fontSize: "var(--fs-12)", fontWeight: 700,
                                            color: r.overall_score >= 80 ? "#34d399" : r.overall_score >= 50 ? "#fbbf24" : "#f87171",
                                        }}>{r.overall_score}/100</span>
                                        <StatusBadge status={r.overall_status} />
                                    </div>
                                </div>
                                <div className="panel__body">
                                    <p style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", margin: "0 0 var(--s-3) 0" }}>{r.summary}</p>
                                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "var(--s-2)" }}>
                                        {r.checks?.filter(c => c.status !== "not_applicable").map(c => (
                                            <div key={c.id} style={{ display: "flex", alignItems: "flex-start", gap: "var(--s-2)", padding: "var(--s-2)", borderRadius: "var(--radius-md)", background: "var(--c-bg-elevated)", fontSize: "var(--fs-11)" }}>
                                                {c.status === "pass" ? <CheckCircleOutlinedIcon sx={{ fontSize: 14, color: "#34d399", mt: "2px" }} /> :
                                                 c.status === "fail" ? <ErrorOutlineOutlinedIcon sx={{ fontSize: 14, color: "#f87171", mt: "2px" }} /> :
                                                 <WarningAmberOutlinedIcon sx={{ fontSize: 14, color: "#fbbf24", mt: "2px" }} />}
                                                <div>
                                                    <div style={{ fontWeight: "var(--fw-medium)" }}>{c.name}</div>
                                                    <div style={{ color: "var(--c-text-muted)", marginTop: 2 }}>{c.evidence}</div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}

                {/* Scanning progress */}
                {scanState === "scanning" && (
                    <div className="panel" style={{ background: "transparent", border: "none" }}>
                        <div className="panel__body" style={{ textAlign: "center", padding: "var(--s-8)", display: "flex", flexDirection: "column", alignItems: "center" }}>
                            <img src="/scanning.gif" alt="Scanning..." style={{ width: 120, height: 120, objectFit: "contain" }} />
                            <div style={{ fontSize: "var(--fs-14)", fontWeight: "var(--fw-medium)", color: "var(--c-text)", marginTop: "var(--s-4)" }}>
                                Analyzing designs...
                            </div>
                        </div>
                    </div>
                )}

                {error && <div className="alert alert--danger" style={{ marginTop: "var(--s-4)" }}>{error}</div>}
            </main>
        </>
    );
}

function StatCard({ label, value }: { label: string; value: string | number }) {
    return (
        <div className="panel">
            <div className="panel__body" style={{ textAlign: "center", padding: "var(--s-4)" }}>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--c-text)" }}>{value}</div>
                <div style={{ fontSize: "var(--fs-12)", color: "var(--c-text)", marginTop: 4 }}>{label}</div>
            </div>
        </div>
    );
}

function StatusBadge({ status }: { status: string }) {
    const cfg: Record<string, { bg: string; color: string; label: string }> = {
        compliant: { bg: "rgba(52,211,153,0.12)", color: "#34d399", label: "Compliant" },
        needs_review: { bg: "rgba(251,191,36,0.12)", color: "#fbbf24", label: "Needs Review" },
        non_compliant: { bg: "rgba(248,113,113,0.12)", color: "#f87171", label: "Non-Compliant" },
    };
    const c = cfg[status] ?? cfg.needs_review;
    return <span style={{ padding: "2px 10px", borderRadius: "var(--radius-full)", fontSize: "var(--fs-11)", fontWeight: 600, background: c.bg, color: c.color }}>{c.label}</span>;
}
