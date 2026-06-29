from __future__ import annotations

from typing import List
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Request, status
from fastapi.responses import HTMLResponse, JSONResponse, Response

from app.core.idempotency import (
    begin_idempotent_request,
    cached_idempotency_response,
    complete_idempotent_request,
    get_idempotency_key,
)
from app.core.rate_limit import RateLimited, TIER_EXPENSIVE
from app.core.security import Actor, get_actor, require_operator
from app.domain.models import AwsScanRecord, JobType, ScanRecord, ScanTriggerRequest
from app.services.job_queue import (
    build_pending_aws_scan,
    build_pending_github_scan,
    job_queue,
)
from app.services.scan_report_pdf import build_scan_report_pdf
from app.services.store import store

router = APIRouter()


def _validate_github_ready(organization_id: str) -> None:
    conn = store.get_github_connection(organization_id)
    if not conn or not conn.get("github_access_token"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="GitHub is not connected. Connect your GitHub account in Settings first.",
        )


def _validate_aws_ready(organization_id: str) -> tuple[str, str]:
    conn = store.get_aws_connection(organization_id)
    if not conn or not conn.get("aws_role_arn"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="AWS is not connected. Add your IAM Role ARN in Settings first.",
        )
    account_id = conn.get("aws_account_id", "")
    region = conn.get("aws_region", "us-east-1")
    return account_id, region


@router.post(
    "/",
    response_model=ScanRecord,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
async def trigger_scan(
    body: ScanTriggerRequest,
    request: Request,
    actor: Actor = Depends(require_operator),
) -> ScanRecord | JSONResponse:
    """Enqueue a GitHub compliance scan. Poll GET /scans/{scan_id} until completed."""
    idempotency_key = get_idempotency_key(request)
    key, cached = begin_idempotent_request(
        actor.organization_id,
        idempotency_key,
        method=request.method,
        path=str(request.url.path),
    )
    if cached:
        return cached_idempotency_response(cached)

    _validate_github_ready(actor.organization_id)

    scan_id = str(uuid4())
    pending = build_pending_github_scan(
        scan_id=scan_id,
        github_org=body.github_org,
        scope=body.scope,
        triggered_by=actor.user_id,
    )
    store.save_scan(actor.user_id, actor.organization_id, pending)
    await job_queue.enqueue(
        job_type=JobType.github_scan,
        organization_id=actor.organization_id,
        user_id=actor.user_id,
        payload={
            "github_org": body.github_org,
            "scope": body.scope,
            "triggered_by": actor.user_id,
        },
        resource_id=scan_id,
    )

    response_body = pending.model_dump(mode="json")
    complete_idempotent_request(
        actor.organization_id,
        key,
        status_code=status.HTTP_202_ACCEPTED,
        response_body=response_body,
        resource_id=scan_id,
    )
    return pending


@router.get("/", response_model=List[ScanRecord])
def list_scans(actor: Actor = Depends(get_actor)) -> List[ScanRecord]:
    """Return scan history for the current organization."""
    return store.list_scans(actor.organization_id)


@router.post(
    "/aws",
    response_model=AwsScanRecord,
    status_code=status.HTTP_202_ACCEPTED,
    dependencies=[Depends(RateLimited(TIER_EXPENSIVE))],
)
async def trigger_aws_scan(
    request: Request,
    actor: Actor = Depends(require_operator),
) -> AwsScanRecord | JSONResponse:
    """Enqueue an AWS compliance scan. Poll GET /scans/aws/{scan_id} until completed."""
    idempotency_key = get_idempotency_key(request)
    key, cached = begin_idempotent_request(
        actor.organization_id,
        idempotency_key,
        method=request.method,
        path=str(request.url.path),
    )
    if cached:
        return cached_idempotency_response(cached)

    account_id, region = _validate_aws_ready(actor.organization_id)

    scan_id = str(uuid4())
    pending = build_pending_aws_scan(
        scan_id=scan_id,
        account_id=account_id,
        region=region,
        triggered_by=actor.user_id,
    )
    store.save_aws_scan(actor.user_id, actor.organization_id, pending)
    await job_queue.enqueue(
        job_type=JobType.aws_scan,
        organization_id=actor.organization_id,
        user_id=actor.user_id,
        payload={"triggered_by": actor.user_id},
        resource_id=scan_id,
    )

    response_body = pending.model_dump(mode="json")
    complete_idempotent_request(
        actor.organization_id,
        key,
        status_code=status.HTTP_202_ACCEPTED,
        response_body=response_body,
        resource_id=scan_id,
    )
    return pending


@router.get("/aws", response_model=List[AwsScanRecord])
def list_aws_scans(actor: Actor = Depends(get_actor)) -> List[AwsScanRecord]:
    """Return AWS scan history for the current organization."""
    return store.list_aws_scans(actor.organization_id)


@router.get("/aws/{scan_id}", response_model=AwsScanRecord)
def get_aws_scan(scan_id: str, actor: Actor = Depends(get_actor)) -> AwsScanRecord:
    record = store.get_aws_scan(scan_id, actor.organization_id)
    if record is None:
        raise HTTPException(status_code=404, detail="AWS scan not found")
    return record


@router.get("/{scan_id}", response_model=ScanRecord)
def get_scan(scan_id: str, actor: Actor = Depends(get_actor)) -> ScanRecord:
    record = store.get_scan(scan_id, actor.organization_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    return record


@router.get("/{scan_id}/report", response_class=HTMLResponse)
def get_scan_report(scan_id: str, actor: Actor = Depends(get_actor)) -> HTMLResponse:
    """Return a print-ready HTML compliance report for a scan."""
    record = store.get_scan(scan_id, actor.organization_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if record.status.value != "completed":
        raise HTTPException(status_code=409, detail="Scan is not completed yet")
    return HTMLResponse(content=_build_report_html(record), status_code=200)


@router.get("/{scan_id}/report.pdf", dependencies=[Depends(RateLimited(TIER_EXPENSIVE))])
def get_scan_report_pdf(scan_id: str, actor: Actor = Depends(get_actor)) -> Response:
    """Return a downloadable PDF compliance report for a scan."""
    record = store.get_scan(scan_id, actor.organization_id)
    if record is None:
        raise HTTPException(status_code=404, detail="Scan not found")
    if record.status.value != "completed":
        raise HTTPException(status_code=409, detail="Scan is not completed yet")
    pdf_bytes = build_scan_report_pdf(record)
    filename = f"trustfabric-scan-{scan_id[:8]}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )


def _build_report_html(r: ScanRecord) -> str:
    score = r.results.compliance_score
    score_color = "#22c55e" if score >= 80 else "#f59e0b" if score >= 50 else "#ef4444"
    ts = r.timestamp.strftime("%B %d, %Y at %H:%M UTC")

    violations_html = ""
    for v in r.results.violations:
        sev_color = "#ef4444" if v.severity.value == "high" else "#f59e0b" if v.severity.value == "medium" else "#94a3b8"
        violations_html += f"""
        <tr>
            <td><strong>{v.policy_name}</strong></td>
            <td><span style="color:{sev_color};font-weight:600;text-transform:uppercase;font-size:11px">{v.severity.value}</span></td>
            <td>{v.evidence}</td>
            <td>{v.recommendation}</td>
        </tr>"""

    compliant_html = ""
    for c in r.results.compliant:
        compliant_html += f"""
        <tr>
            <td><strong>{c.policy_name}</strong></td>
            <td><span style="color:#22c55e;font-weight:600;text-transform:uppercase;font-size:11px">{c.severity.value}</span></td>
            <td>{c.evidence}</td>
        </tr>"""

    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>TrustFabric — Compliance Report</title>
<style>
  @media print {{ @page {{ margin: 20mm; }} button {{ display: none !important; }} }}
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; font-size: 13px; color: #1e293b; background: #fff; padding: 32px; max-width: 960px; margin: 0 auto; }}
  .header {{ display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #1e293b; padding-bottom: 16px; margin-bottom: 24px; }}
  .brand {{ font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }}
  .brand span {{ color: #f59e0b; }}
  .meta {{ text-align: right; font-size: 12px; color: #64748b; line-height: 1.6; }}
  .score-section {{ display: flex; align-items: center; gap: 24px; padding: 20px 24px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; margin-bottom: 24px; }}
  .score-circle {{ width: 72px; height: 72px; border-radius: 50%; background: conic-gradient({score_color} {score}%, #e2e8f0 0); display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; color: {score_color}; flex-shrink: 0; }}
  .score-label {{ font-size: 15px; font-weight: 600; margin-bottom: 4px; }}
  .score-sub {{ font-size: 12px; color: #64748b; }}
  .stats {{ display: flex; gap: 32px; margin-left: auto; }}
  .stat {{ text-align: center; }}
  .stat-num {{ font-size: 24px; font-weight: 700; }}
  .stat-lbl {{ font-size: 11px; color: #64748b; text-transform: uppercase; letter-spacing: 0.05em; }}
  h2 {{ font-size: 14px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.06em; color: #64748b; margin: 24px 0 12px; padding-bottom: 6px; border-bottom: 1px solid #e2e8f0; }}
  table {{ width: 100%; border-collapse: collapse; margin-bottom: 24px; font-size: 12px; }}
  th {{ background: #f1f5f9; padding: 8px 12px; text-align: left; font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.04em; color: #64748b; }}
  td {{ padding: 10px 12px; border-bottom: 1px solid #f1f5f9; vertical-align: top; line-height: 1.5; }}
  tr:last-child td {{ border-bottom: none; }}
  .nist {{ display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }}
  .nist-card {{ padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; }}
  .nist-fn {{ font-size: 11px; font-weight: 700; color: #f59e0b; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 4px; }}
  .nist-desc {{ font-size: 11px; color: #64748b; line-height: 1.5; }}
  .footer {{ margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 11px; color: #94a3b8; display: flex; justify-content: space-between; }}
  .print-btn {{ position: fixed; top: 16px; right: 16px; background: #1e293b; color: white; border: none; padding: 10px 20px; border-radius: 6px; font-size: 13px; cursor: pointer; font-weight: 600; }}
  .print-btn:hover {{ background: #334155; }}
</style>
</head>
<body>
<button class="print-btn" onclick="window.print()">⬇ Save as PDF</button>

<div class="header">
  <div>
    <div class="brand">Trust<span>Fabric</span></div>
    <div style="font-size:12px;color:#64748b;margin-top:4px">AI Governance Compliance Report</div>
  </div>
  <div class="meta">
    <div><strong>Organization:</strong> {r.organization}</div>
    <div><strong>Scan ID:</strong> {r.scan_id[:8]}…</div>
    <div><strong>Date:</strong> {ts}</div>
    <div><strong>Duration:</strong> {r.duration_seconds:.1f}s</div>
  </div>
</div>

<div class="score-section">
  <div class="score-circle">{score}%</div>
  <div>
    <div class="score-label">Overall Compliance Score</div>
    <div class="score-sub">Based on {r.results.total_policies} policies checked against GitHub configuration</div>
  </div>
  <div class="stats">
    <div class="stat"><div class="stat-num" style="color:#ef4444">{len(r.results.violations)}</div><div class="stat-lbl">Violations</div></div>
    <div class="stat"><div class="stat-num" style="color:#22c55e">{len(r.results.compliant)}</div><div class="stat-lbl">Compliant</div></div>
    <div class="stat"><div class="stat-num">{r.results.total_policies}</div><div class="stat-lbl">Total checks</div></div>
  </div>
</div>

{'<h2>⚠ Policy Violations (' + str(len(r.results.violations)) + ')</h2><table><thead><tr><th>Policy</th><th>Severity</th><th>Evidence</th><th>Recommendation</th></tr></thead><tbody>' + violations_html + '</tbody></table>' if r.results.violations else '<h2>✓ No Violations Found</h2>'}

{'<h2>✓ Compliant Policies (' + str(len(r.results.compliant)) + ')</h2><table><thead><tr><th>Policy</th><th>Severity</th><th>Evidence</th></tr></thead><tbody>' + compliant_html + '</tbody></table>' if r.results.compliant else ''}

<h2>NIST AI RMF Alignment</h2>
<div class="nist">
  <div class="nist-card"><div class="nist-fn">Govern</div><div class="nist-desc">Role-based access, advisory-only AI recommendations, policy lifecycle management</div></div>
  <div class="nist-card"><div class="nist-fn">Map</div><div class="nist-desc">AI system registry capturing model type, data sensitivity, integrations</div></div>
  <div class="nist-card"><div class="nist-fn">Measure</div><div class="nist-desc">Automated compliance scanning, LLM interaction logging, risk scoring</div></div>
  <div class="nist-card"><div class="nist-fn">Manage</div><div class="nist-desc">Rate limiting, risk tiers driving required controls, human-in-the-loop approval</div></div>
</div>

<div class="footer">
  <div>Generated by TrustFabric AI Governance Platform</div>
  <div>AI-assisted analysis. Human review required before taking action.</div>
</div>
</body>
</html>"""
