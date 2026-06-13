"use client";
import { CheckCircleOutlineIcon, CancelOutlinedIcon, RemoveCircleOutlineIcon, PendingOutlinedIcon, ExpandMoreIcon, ExpandLessIcon, RefreshIcon } from "@/lib/icons";

import { useState, useCallback } from "react";
import Link from "next/link";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { AIIcon } from "@/components/ui/AIIcon";
import { TopBar } from "@/components/layout/TopBar";
import { PageEmptyIllustration } from "@/components/ui/PageEmptyIllustration";
import { complianceApi, scansApi } from "@/lib/api";
import type {
  ComplianceEvaluationResponse,
  FrameworkResult,
  FrameworkRequirementResult,
  FrameworkRequirementStatus,
  ScanResult,
} from "@/types";

// ─── Helpers ─────────────────────────────────────────────────────────────────

function statusIcon(status: FrameworkRequirementStatus) {
  switch (status) {
    case "passed":
      return <CheckCircleOutlineIcon style={{ color: "var(--c-live)", fontSize: 18 }} />;
    case "failed":
      return <CancelOutlinedIcon style={{ color: "var(--c-critical)", fontSize: 18 }} />;
    case "partial":
      return <RemoveCircleOutlineIcon style={{ color: "var(--c-warning)", fontSize: 18 }} />;
    case "manual":
      return <PendingOutlinedIcon style={{ color: "var(--c-text-muted)", fontSize: 18 }} />;
  }
}

function statusLabel(status: FrameworkRequirementStatus) {
  switch (status) {
    case "passed":   return <span className="badge badge--live" style={{ fontSize: 11, borderRadius: "4px" }}>Passed</span>;
    case "failed":   return <span className="badge badge--danger" style={{ fontSize: 11, borderRadius: "4px" }}>Failed</span>;
    case "partial":  return <span className="badge badge--warning" style={{ fontSize: 11, borderRadius: "4px" }}>Partial</span>;
    case "manual":   return <span className="badge" style={{ fontSize: 11, background: "rgba(255,255,255,0.08)", color: "var(--c-text-muted)", borderRadius: "4px" }}>Awaiting</span>;
  }
}

function scoreColor(score: number) {
  if (score >= 75) return "var(--c-live)";
  if (score >= 50) return "var(--c-warning)";
  return "var(--c-critical)";
}

// ─── Requirement Row ─────────────────────────────────────────────────────────

function RequirementRow({
  req,
  frameworkId,
  scanId,
  onAttest,
}: {
  req: FrameworkRequirementResult;
  frameworkId: string;
  scanId: string;
  onAttest: (reqId: string, itemIndex: number, value: boolean) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      style={{
        border: "1px solid var(--c-border)",
        borderRadius: "var(--r-md)",
        marginBottom: "var(--s-2)",
        background: "var(--c-surface)",
        overflow: "hidden",
      }}
    >
      {/* Header row */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          width: "100%",
          display: "flex",
          alignItems: "center",
          gap: "var(--s-4)",
          padding: "var(--s-4) var(--s-5)",
          background: "none",
          border: "none",
          cursor: "pointer",
          textAlign: "left",
          transition: "background 0.2s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.background = "var(--c-surface-hover)")}
        onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
      >
        <div style={{ display: "flex", alignItems: "center", width: 24, justifyContent: "center", flexShrink: 0 }}>
          {statusIcon(req.status)}
        </div>
        <span
          style={{
            fontSize: "var(--fs-11)",
            color: "var(--c-text-muted)",
            fontWeight: "var(--fw-semibold)",
            minWidth: 72,
            letterSpacing: "0.02em",
            flexShrink: 0,
          }}
        >
          {req.article}
        </span>
        <span style={{ flex: 1, fontSize: "var(--fs-14)", color: "var(--c-text)", fontWeight: "var(--fw-medium)", minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
          {req.title}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: "var(--s-3)", flexShrink: 0 }}>
          {!req.auto_evaluable && (
            <span
              style={{
                fontSize: 10,
                padding: "2px 8px",
                borderRadius: "var(--r-pill)",
                background: "var(--c-accent-subtle)",
                color: "var(--c-accent-text)",
                fontWeight: "var(--fw-bold)",
                textTransform: "uppercase",
                letterSpacing: "0.05em",
              }}
            >
              Manual
            </span>
          )}
          {statusLabel(req.status)}
          <span style={{ color: "var(--c-text)", fontSize: "var(--fs-12)", fontWeight: "var(--fw-semibold)", minWidth: 44, textAlign: "right", fontFamily: "tabular-nums" }}>
            {Math.round(req.score * 100)}%
          </span>
          <div style={{ color: "var(--c-text-muted)", transition: "transform 0.2s", transform: open ? "rotate(0deg)" : "rotate(0deg)" }}>
            {open ? <ExpandLessIcon style={{ fontSize: 20 }} /> : <ExpandMoreIcon style={{ fontSize: 20 }} />}
          </div>
        </div>
      </button>

      {/* Expanded body */}
      {open && (
        <div
          style={{
            padding: "var(--s-5) var(--s-6) var(--s-6)",
            borderTop: "1px solid var(--c-border)",
            background: "rgba(255,255,255,0.02)",
          }}
        >
          <div style={{ marginBottom: "var(--s-4)" }}>
            <p style={{ fontSize: "var(--fs-13)", color: "var(--c-text-muted)", lineHeight: 1.6, maxWidth: "80ch" }}>
              {req.description}
            </p>
          </div>

          {/* Evidence */}
          {req.evidence.length > 0 && (
            <div style={{ marginBottom: "var(--s-4)" }}>
              <div style={{ fontSize: 10, fontWeight: "var(--fw-bold)", color: "var(--c-live-text)", marginBottom: "var(--s-2)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Verified Evidence
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
                {req.evidence.map((e, i) => (
                  <div key={i} style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", padding: "6px 12px", background: "rgba(16,185,129,0.04)", borderRadius: "var(--r-sm)", borderLeft: "2px solid var(--c-live)" }}>
                    {e}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Gaps */}
          {req.gaps.length > 0 && (
            <div style={{ marginBottom: "var(--s-4)" }}>
              <div style={{ fontSize: 10, fontWeight: "var(--fw-bold)", color: "var(--c-critical-text)", marginBottom: "var(--s-2)", textTransform: "uppercase", letterSpacing: "1px" }}>
                Identified Gaps
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-1)" }}>
                {req.gaps.map((g, i) => (
                  <div key={i} style={{ fontSize: "var(--fs-12)", color: "var(--c-text-secondary)", padding: "6px 12px", background: "rgba(244,63,94,0.04)", borderRadius: "var(--r-sm)", borderLeft: "2px solid var(--c-critical)" }}>
                    {g}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Manual checklist */}
          {!req.auto_evaluable && req.checklist.length > 0 && (
            <div>
              <div style={{ fontSize: 11, fontWeight: "var(--fw-semibold)", color: "var(--c-accent)", marginBottom: "var(--s-2)", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                Manual Checklist — click to attest
              </div>
              {req.checklist.map((item, i) => (
                <label
                  key={i}
                  className="checkbox-label"
                  style={{
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "var(--s-2)",
                    marginBottom: "var(--s-2)",
                    cursor: "pointer",
                    fontSize: "var(--fs-12)",
                    color: req.checklist_done[i] ? "var(--c-text)" : "var(--c-text-muted)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={req.checklist_done[i] ?? false}
                    onChange={(e) => onAttest(req.id, i, e.target.checked)}
                    style={{ marginTop: 2 }}
                  />
                  <span>{item}</span>
                </label>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Framework Card ───────────────────────────────────────────────────────────

function FrameworkCard({
  fw,
  scanId,
  onAttest,
}: {
  fw: FrameworkResult;
  scanId: string;
  onAttest: (frameworkId: string, reqId: string, itemIndex: number, value: boolean) => void;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="panel" style={{ marginBottom: "var(--s-6)", transition: "all 0.3s ease" }}>
      {/* Card header */}
      <div style={{ display: "flex", alignItems: "center", gap: "var(--s-6)", padding: "var(--s-5) var(--s-6)", marginBottom: expanded ? 0 : 0 }}>
        {/* Score circle */}
        <div
          style={{
            width: 56,
            height: 56,
            borderRadius: "50%",
            border: `2px solid ${scoreColor(fw.overall_score)}`,
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            background: `${scoreColor(fw.overall_score)}10`,
            boxShadow: `0 0 12px ${scoreColor(fw.overall_score)}15`,
          }}
        >
          <span style={{ fontSize: "var(--fs-16)", fontWeight: "var(--fw-bold)", color: scoreColor(fw.overall_score), lineHeight: 1 }}>
            {fw.overall_score}
          </span>
          <span style={{ fontSize: 8, color: "var(--c-text-muted)", fontWeight: "var(--fw-medium)", opacity: 0.8 }}>/100</span>
        </div>

        <div style={{ flex: 1 }}>
          <div style={{ display: "flex", alignItems: "center", gap: "var(--s-2)", marginBottom: "var(--s-1)" }}>
            <span style={{ fontSize: "var(--fs-16)", fontWeight: "var(--fw-bold)", color: "var(--c-text)" }}>
              {fw.framework_name}
            </span>
            <span style={{ fontSize: 10, color: "var(--c-text-muted)", padding: "1px 6px", border: "1px solid var(--c-border)", borderRadius: "var(--r-pill)" }}>
              v{fw.framework_version}
            </span>
          </div>

          {/* Stats row */}
          <div style={{ display: "flex", gap: "var(--s-4)", flexWrap: "wrap" }}>
            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-live)" }}>
              ✓ {fw.passed_requirements} passed
            </span>
            {fw.partial_requirements > 0 && (
              <span style={{ fontSize: "var(--fs-12)", color: "var(--c-warning)" }}>
                ~ {fw.partial_requirements} partial
              </span>
            )}
            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-critical)" }}>
              ✗ {fw.failed_requirements} failed
            </span>
            <span style={{ fontSize: "var(--fs-12)", color: "var(--c-text-muted)" }}>
              ◷ {fw.manual_requirements} manual
            </span>
          </div>

          {fw.auto_requirements < fw.total_requirements && (
            <div style={{ marginTop: "var(--s-1)", fontSize: 11, color: "var(--c-text-muted)" }}>
              Auto-verified: {fw.auto_requirements}/{fw.total_requirements} requirements •{" "}
              {fw.manual_requirements} require manual attestation
            </div>
          )}
        </div>

        <button
          className="btn btn--ghost"
          onClick={() => setExpanded(!expanded)}
          style={{ display: "flex", alignItems: "center", gap: "var(--s-1)", fontSize: "var(--fs-12)" }}
        >
          {expanded ? "Hide" : "View"} requirements
          {expanded ? <ExpandLessIcon style={{ fontSize: 16 }} /> : <ExpandMoreIcon style={{ fontSize: 16 }} />}
        </button>
      </div>

      {/* Requirements list */}
      {expanded && (
        <div style={{ borderTop: "1px solid var(--c-border)", padding: "var(--s-6)", background: "rgba(255,255,255,0.01)" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "var(--s-3)" }}>
            {fw.requirements.map((req) => (
              <RequirementRow
                key={req.id}
                req={req}
                frameworkId={fw.framework_id}
                scanId={scanId}
                onAttest={(reqId, itemIndex, value) =>
                  onAttest(fw.framework_id, reqId, itemIndex, value)
                }
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function CompliancePage() {
  const queryClient = useQueryClient();

  // Load recent scans to pick the latest
  const { data: scans } = useQuery<ScanResult[]>({
    queryKey: ["scans"],
    queryFn: scansApi.list,
  });

  const latestScan = scans?.[0] ?? null;
  const [selectedScanId, setSelectedScanId] = useState<string | null>(null);
  const activeScanId = selectedScanId ?? latestScan?.scan_id ?? null;

  const {
    data: evaluation,
    isLoading,
    isError,
    refetch,
  } = useQuery<ComplianceEvaluationResponse>({
    queryKey: ["compliance", activeScanId],
    queryFn: () => complianceApi.evaluate(activeScanId!),
    enabled: !!activeScanId,
    staleTime: 5 * 60 * 1000,
  });

  const refreshMutation = useMutation({
    mutationFn: () => complianceApi.refresh(activeScanId!),
    onSuccess: (data) => {
      queryClient.setQueryData(["compliance", activeScanId], data);
    },
  });

  const attestMutation = useMutation({
    mutationFn: (body: { framework_id: string; req_id: string; item_index: number; value: boolean }) =>
      complianceApi.submitAttestation(body),
    onSuccess: () => {
      // Refresh scores after attestation
      refreshMutation.mutate();
    },
  });

  const handleAttest = useCallback(
    (frameworkId: string, reqId: string, itemIndex: number, value: boolean) => {
      attestMutation.mutate({ framework_id: frameworkId, req_id: reqId, item_index: itemIndex, value });
    },
    [attestMutation]
  );

  // ── No scan state ──────────────────────────────────────────────────────────
  if (!activeScanId) {
    return (
      <>
        <TopBar
          title="Compliance Frameworks"
          subtitle="EU AI Act · NIST AI RMF · NIST CSF · SOC 2"
          actions={
            <Link href="/scans" className="btn btn--primary">
              Go to Scans
            </Link>
          }
        />
        <main className="page page--flex">
          <div className="page-empty-shell">
            <PageEmptyIllustration
              src="/scan-comp.png"
              title="No compliance data"
              label="Run a scan to evaluate your frameworks"
            />
          </div>
        </main>
      </>
    );
  }

  // ── Loading ────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <>
        <TopBar title="Compliance Frameworks" subtitle="Evaluating frameworks…" />
        <main className="page page--flex">
          <div className="page-empty-shell">
            <div className="page-empty page-empty--in-panel">
              <div
                className="loading-spinner"
                style={{
                  width: 40,
                  height: 40,
                  border: "3px solid var(--c-border)",
                  borderTopColor: "var(--c-accent)",
                  borderRadius: "50%",
                  animation: "spin 0.8s linear infinite",
                  marginBottom: "var(--s-4)",
                }}
              />
              <h2 className="page-empty__title">Evaluating frameworks</h2>
              <p className="page-empty__label">This may take a moment</p>
            </div>
          </div>
        </main>
      </>
    );
  }

  const frameworks = evaluation?.frameworks ?? [];

  // Aggregate summary
  const totalFrameworks = frameworks.length;
  const avgScore = totalFrameworks > 0
    ? Math.round(frameworks.reduce((s, f) => s + f.overall_score, 0) / totalFrameworks)
    : 0;
  const totalReqs = frameworks.reduce((s, f) => s + f.total_requirements, 0);
  const passedReqs = frameworks.reduce((s, f) => s + f.passed_requirements, 0);
  const manualPending = frameworks.reduce((s, f) => s + f.requirements.filter(r => r.status === "manual").length, 0);

  return (
    <div style={{ padding: "var(--s-8)", maxWidth: 960, margin: "0 auto" }}>
      {/* Page header */}
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", marginBottom: "var(--s-6)", flexWrap: "wrap", gap: "var(--s-3)" }}>
        <div>
          <h1 style={{ fontSize: "var(--fs-24)", fontWeight: "var(--fw-bold)", marginBottom: "var(--s-1)" }}>
            Compliance Frameworks
          </h1>
          <p style={{ color: "var(--c-text-muted)", fontSize: "var(--fs-13)" }}>
            Evaluated against scan{" "}
            <span style={{ fontFamily: "monospace", fontSize: "var(--fs-12)", color: "var(--c-accent)" }}>
              {activeScanId.slice(0, 12)}…
            </span>
          </p>
        </div>
        <div style={{ display: "flex", gap: "var(--s-2)" }}>
          {scans && scans.length > 1 && (
            <select
              value={selectedScanId ?? latestScan?.scan_id ?? ""}
              onChange={(e) => setSelectedScanId(e.target.value)}
              className="input"
              style={{ fontSize: "var(--fs-12)", padding: "var(--s-2) var(--s-3)" }}
            >
              {scans.map((s) => (
                <option key={s.scan_id} value={s.scan_id}>
                  {new Date(s.timestamp).toLocaleDateString()} — {s.organization}
                </option>
              ))}
            </select>
          )}
          <button
            className="btn btn--ghost"
            onClick={() => refreshMutation.mutate()}
            disabled={refreshMutation.isPending}
            style={{ display: "flex", alignItems: "center", gap: "var(--s-1)", fontSize: "var(--fs-12)" }}
          >
            <RefreshIcon style={{ fontSize: 16 }} />
            {refreshMutation.isPending ? "Refreshing…" : "Refresh"}
          </button>
        </div>
      </div>

      {/* Summary stat cards */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "var(--s-3)", marginBottom: "var(--s-6)" }}>
        <div className="stat-card stat-card--info">
          <div className="stat-card__value">{avgScore}%</div>
          <div className="stat-card__label">Average Score</div>
        </div>
        <div className="stat-card stat-card--success">
          <div className="stat-card__value">{passedReqs}/{totalReqs}</div>
          <div className="stat-card__label">Requirements Passed</div>
        </div>
        <div className="stat-card">
          <div className="stat-card__value">{totalFrameworks}</div>
          <div className="stat-card__label">Frameworks Evaluated</div>
        </div>
        {manualPending > 0 && (
          <div className="stat-card stat-card--danger">
            <div className="stat-card__value">{manualPending}</div>
            <div className="stat-card__label">Awaiting Attestation</div>
          </div>
        )}
      </div>

      {/* Manual attestation notice */}
      {manualPending > 0 && (
        <div
          style={{
            padding: "var(--s-3) var(--s-5)",
            borderRadius: "var(--r-lg)",
            border: "1px solid var(--c-border-strong)",
            background: "rgba(255,255,255,0.03)",
            marginBottom: "var(--s-6)",
            display: "flex",
            alignItems: "center",
            gap: "var(--s-3)",
            fontSize: "var(--fs-13)",
          }}
        >
          <AIIcon size={20} style={{ opacity: 0.8 }} />
          <span style={{ color: "var(--c-text)", lineHeight: 1.5 }}>
            <strong style={{ color: "var(--c-text)", fontWeight: "var(--fw-bold)" }}>{manualPending} requirements</strong> need manual attestation.
            Expand each framework below and check off completed items to improve your score.
          </span>
        </div>
      )}

      {/* Framework cards */}
      {frameworks.length === 0 ? (
        <div className="panel" style={{ textAlign: "center", padding: "var(--s-8)" }}>
          <p style={{ color: "var(--c-text-muted)" }}>No framework results available. Try refreshing.</p>
        </div>
      ) : (
        frameworks
          .sort((a, b) => b.overall_score - a.overall_score)
          .map((fw) => (
            <FrameworkCard
              key={fw.framework_id}
              fw={fw}
              scanId={activeScanId}
              onAttest={handleAttest}
            />
          ))
      )}

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}
