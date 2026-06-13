from __future__ import annotations

import time
from datetime import datetime
from uuid import uuid4

from app.domain.models import (
    AwsCheckResult,
    AwsScanRecord,
    GovernancePolicySeverity,
    ScanStatus,
)
from app.integrations import aws as aws_integration
from app.services.store import store

AWS_CHECKS = {
    "aws_iam_root_mfa": {
        "name": "Root Account MFA Enabled",
        "severity": GovernancePolicySeverity.high,
        "recommendation": "Enable MFA on the root account in IAM → Security credentials",
        "risk_score": 95,
    },
    "aws_iam_password_policy": {
        "name": "Strong Password Policy",
        "severity": GovernancePolicySeverity.medium,
        "recommendation": "Set minimum password length to 14+, require symbols/numbers/uppercase in IAM → Account settings",
        "risk_score": 50,
    },
    "aws_iam_unused_keys": {
        "name": "No Unused Access Keys (>90 days)",
        "severity": GovernancePolicySeverity.medium,
        "recommendation": "Rotate or deactivate access keys that have not been used in >90 days",
        "risk_score": 55,
    },
    "aws_iam_user_mfa": {
        "name": "Console Users Have MFA",
        "severity": GovernancePolicySeverity.high,
        "recommendation": "Enable MFA for all IAM users with console access",
        "risk_score": 85,
    },
    "aws_iam_no_inline_policies": {
        "name": "No Inline Policies on IAM Users",
        "severity": GovernancePolicySeverity.low,
        "recommendation": "Replace inline policies with managed policies for better governance",
        "risk_score": 25,
    },
    "aws_s3_encryption": {
        "name": "S3 Default Encryption Enabled",
        "severity": GovernancePolicySeverity.high,
        "recommendation": "Enable default encryption (SSE-S3 or SSE-KMS) on all S3 buckets",
        "risk_score": 80,
    },
    "aws_s3_public_access": {
        "name": "S3 Public Access Blocked",
        "severity": GovernancePolicySeverity.high,
        "recommendation": "Enable 'Block all public access' on every bucket via S3 → Permissions",
        "risk_score": 90,
    },
    "aws_s3_versioning": {
        "name": "S3 Versioning Enabled",
        "severity": GovernancePolicySeverity.medium,
        "recommendation": "Enable versioning on all buckets for data protection and recovery",
        "risk_score": 45,
    },
    "aws_cloudtrail_enabled": {
        "name": "Multi-Region CloudTrail Enabled",
        "severity": GovernancePolicySeverity.high,
        "recommendation": "Create a multi-region trail in CloudTrail with logging enabled",
        "risk_score": 90,
    },
    "aws_cloudtrail_log_validation": {
        "name": "CloudTrail Log File Validation",
        "severity": GovernancePolicySeverity.medium,
        "recommendation": "Enable log file validation on all CloudTrail trails",
        "risk_score": 50,
    },
    "aws_config_enabled": {
        "name": "AWS Config Recorder Enabled",
        "severity": GovernancePolicySeverity.high,
        "recommendation": "Enable AWS Config in Settings → Recorder to track configuration changes",
        "risk_score": 80,
    },
    "aws_config_delivery": {
        "name": "AWS Config Delivery Channel Active",
        "severity": GovernancePolicySeverity.medium,
        "recommendation": "Configure an S3 delivery channel in AWS Config for compliance snapshots",
        "risk_score": 45,
    },
    "aws_securityhub_enabled": {
        "name": "Security Hub Enabled",
        "severity": GovernancePolicySeverity.medium,
        "recommendation": "Enable AWS Security Hub for centralized security findings",
        "risk_score": 55,
    },
    "aws_securityhub_nist_findings": {
        "name": "No Critical/High NIST 800-53 Findings",
        "severity": GovernancePolicySeverity.high,
        "recommendation": "Remediate critical and high NIST 800-53 findings in Security Hub",
        "risk_score": 90,
    },
}


def run_aws_scan(user_id: str, organization_id: str, triggered_by: str) -> AwsScanRecord:
    conn = store.get_aws_connection(organization_id)
    if not conn or not conn.get("aws_role_arn"):
        raise ValueError("AWS is not connected. Add your IAM Role ARN in Settings first.")

    role_arn = conn["aws_role_arn"]
    region = conn.get("aws_region", "us-east-1")

    start = time.monotonic()
    account_info, raw_results = aws_integration.run_all_audits(role_arn, region)

    checks: list[AwsCheckResult] = []
    for r in raw_results:
        meta = AWS_CHECKS.get(r["check_id"])
        if not meta:
            continue
        checks.append(AwsCheckResult(
            check_id=r["check_id"],
            check_name=meta["name"],
            severity=meta["severity"],
            passed=r["passed"],
            evidence=r["evidence"],
            recommendation="" if r["passed"] else meta["recommendation"],
            risk_score=0 if r["passed"] else meta["risk_score"],
            affected_resources=r.get("affected_resources", []),
        ))

    passed = sum(1 for c in checks if c.passed)
    failed = len(checks) - passed
    score = round((passed / len(checks)) * 100) if checks else 100

    record = AwsScanRecord(
        scan_id=str(uuid4()),
        account_id=account_info.get("account_id", conn.get("aws_account_id", "")),
        region=region,
        timestamp=datetime.utcnow(),
        compliance_score=score,
        total_checks=len(checks),
        passed_checks=passed,
        failed_checks=failed,
        checks=checks,
        duration_seconds=round(time.monotonic() - start, 2),
        triggered_by=triggered_by,
        status=ScanStatus.completed,
    )

    store.save_aws_scan(user_id, organization_id, record)
    return record
