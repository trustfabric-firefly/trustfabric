from datetime import datetime, timezone

from app.domain.models import (
    GitHubScannedConfig,
    GovernancePolicySeverity,
    ScanConfig,
    ScanRecord,
    ScanResults,
    ScanStatus,
    ScanViolation,
    ViolationStatus,
)
from app.services.scan_report_pdf import build_scan_report_pdf


def _sample_record() -> ScanRecord:
    return ScanRecord(
        scan_id="scan-test-001",
        organization="Acme Corp",
        timestamp=datetime(2026, 6, 13, 12, 0, tzinfo=timezone.utc),
        config=ScanConfig(scope="repositories", github_org="acme", policies_checked=["chk_branch_protection"]),
        github_config=GitHubScannedConfig(),
        results=ScanResults(
            compliance_score=72,
            total_policies=3,
            violations=[
                ScanViolation(
                    policy_id="p1",
                    policy_name="Branch protection required",
                    status=ViolationStatus.violation,
                    severity=GovernancePolicySeverity.high,
                    evidence="main branch has no protection rules → enable protection",
                    recommendation="Enable branch protection on main",
                    risk_score=8,
                )
            ],
            compliant=[
                ScanViolation(
                    policy_id="p2",
                    policy_name="Secret scanning enabled",
                    status=ViolationStatus.compliant,
                    severity=GovernancePolicySeverity.medium,
                    evidence="Secret scanning is enabled org-wide",
                    recommendation="No action required",
                    risk_score=0,
                )
            ],
        ),
        duration_seconds=12.4,
        triggered_by="admin",
        status=ScanStatus.completed,
    )


def test_build_scan_report_pdf_returns_pdf_bytes() -> None:
    pdf_bytes = build_scan_report_pdf(_sample_record())
    assert isinstance(pdf_bytes, bytes)
    assert pdf_bytes.startswith(b"%PDF")
    assert len(pdf_bytes) > 500
