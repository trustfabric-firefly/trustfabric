from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest

from app.domain.models import GovernancePolicySeverity, ScanStatus
from app.services import aws_scan
from app.services.aws_scan import AWS_CHECKS, run_aws_scan


def test_aws_checks_have_required_metadata():
    assert len(AWS_CHECKS) >= 10
    for check_id, meta in AWS_CHECKS.items():
        assert check_id.startswith("aws_")
        assert isinstance(meta["name"], str) and meta["name"]
        assert isinstance(meta["severity"], GovernancePolicySeverity)
        assert isinstance(meta["risk_score"], int)
        assert "recommendation" in meta


def test_aws_checks_cover_core_domains():
    keys = set(AWS_CHECKS)
    assert any(k.startswith("aws_iam_") for k in keys)
    assert any(k.startswith("aws_s3_") for k in keys)
    assert any(k.startswith("aws_cloudtrail_") for k in keys)


def test_run_aws_scan_raises_without_connection():
    mock_store = MagicMock()
    mock_store.get_aws_connection.return_value = None
    with patch.object(aws_scan, "store", mock_store):
        with pytest.raises(ValueError, match="AWS is not connected"):
            run_aws_scan("u1", "org-1", "admin")


def test_run_aws_scan_raises_without_role_arn():
    mock_store = MagicMock()
    mock_store.get_aws_connection.return_value = {"aws_region": "us-east-1"}
    with patch.object(aws_scan, "store", mock_store):
        with pytest.raises(ValueError, match="AWS is not connected"):
            run_aws_scan("u1", "org-1", "admin")


def test_run_aws_scan_builds_record_and_scores():
    mock_store = MagicMock()
    mock_store.get_aws_connection.return_value = {
        "aws_role_arn": "arn:aws:iam::123456789012:role/test",
        "aws_region": "us-west-2",
    }
    account_info = {"account_id": "123456789012"}
    raw_results = [
        {"check_id": "aws_iam_root_mfa", "passed": True, "evidence": "MFA on"},
        {"check_id": "aws_s3_public_access", "passed": False, "evidence": "public bucket", "affected_resources": ["bucket-x"]},
        {"check_id": "unknown_check", "passed": True, "evidence": "skipped"},
    ]
    with patch.object(aws_scan, "store", mock_store):
        with patch.object(
            aws_scan.aws_integration,
            "run_all_audits",
            return_value=(account_info, raw_results),
        ):
            record = run_aws_scan("u1", "org-1", "admin")

    assert record.status == ScanStatus.completed
    assert record.region == "us-west-2"
    assert record.account_id == "123456789012"
    # unknown_check is skipped -> only 2 checks
    assert record.total_checks == 2
    assert record.passed_checks == 1
    assert record.failed_checks == 1
    assert record.compliance_score == 50
    failed = next(c for c in record.checks if not c.passed)
    assert failed.recommendation  # populated on failure
    assert failed.risk_score > 0
    assert failed.affected_resources == ["bucket-x"]
    mock_store.save_aws_scan.assert_called_once()


def test_run_aws_scan_perfect_score_when_no_checks():
    mock_store = MagicMock()
    mock_store.get_aws_connection.return_value = {
        "aws_role_arn": "arn:aws:iam::123456789012:role/test",
    }
    with patch.object(aws_scan, "store", mock_store):
        with patch.object(
            aws_scan.aws_integration, "run_all_audits", return_value=({}, [])
        ):
            record = run_aws_scan("u1", "org-1", "admin")
    assert record.compliance_score == 100
    assert record.total_checks == 0
