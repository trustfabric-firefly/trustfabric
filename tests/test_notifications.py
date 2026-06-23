from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

from app.domain.models import (
    AwsCheckResult,
    AwsScanRecord,
    GitHubScannedConfig,
    GovernancePolicySeverity,
    ScanConfig,
    ScanRecord,
    ScanResults,
    ScanStatus,
    ScanViolation,
    ViolationStatus,
)
from app.services import notifications
from app.services.notifications import (
    _get_slack,
    notify_aws_scan_completed,
    notify_scan_completed,
    notify_system_change,
)


def _violation(name: str, severity=GovernancePolicySeverity.high) -> ScanViolation:
    return ScanViolation(
        policy_id="chk_" + name,
        policy_name=name,
        status=ViolationStatus.violation,
        severity=severity,
        evidence="e",
        recommendation="r",
        risk_score=50,
    )


def _scan_record(violations=None) -> ScanRecord:
    violations = violations or []
    return ScanRecord(
        scan_id="s1",
        organization="acme",
        timestamp=datetime(2026, 6, 13, tzinfo=timezone.utc),
        config=ScanConfig(scope="repositories", github_org="acme", policies_checked=[]),
        github_config=GitHubScannedConfig(),
        results=ScanResults(
            compliance_score=42,
            total_policies=len(violations),
            violations=violations,
            compliant=[],
        ),
        duration_seconds=1.0,
        triggered_by="admin",
        status=ScanStatus.completed,
    )


def _aws_record(failed_checks=0) -> AwsScanRecord:
    checks = [
        AwsCheckResult(
            check_id=f"aws_c{i}",
            check_name=f"Check {i}",
            severity=GovernancePolicySeverity.high,
            passed=False,
            evidence="e",
            recommendation="r",
            risk_score=50,
        )
        for i in range(failed_checks)
    ]
    return AwsScanRecord(
        scan_id="a1",
        account_id="123456789012",
        region="us-east-1",
        timestamp=datetime(2026, 6, 13, tzinfo=timezone.utc),
        compliance_score=60,
        total_checks=len(checks),
        passed_checks=0,
        failed_checks=failed_checks,
        checks=checks,
        duration_seconds=1.0,
        triggered_by="admin",
        status=ScanStatus.completed,
    )


# --- _get_slack -------------------------------------------------------------


def test_get_slack_returns_none_when_not_connected():
    mock_store = MagicMock()
    mock_store.get_slack_connection.return_value = None
    with patch.object(notifications, "store", mock_store):
        assert _get_slack("org-1") is None


def test_get_slack_returns_none_when_missing_token():
    mock_store = MagicMock()
    mock_store.get_slack_connection.return_value = {"slack_channel_id": "C1"}
    with patch.object(notifications, "store", mock_store):
        assert _get_slack("org-1") is None


def test_get_slack_returns_pair_when_connected():
    mock_store = MagicMock()
    mock_store.get_slack_connection.return_value = {
        "slack_bot_token": "xoxb-1",
        "slack_channel_id": "C1",
    }
    with patch.object(notifications, "store", mock_store):
        assert _get_slack("org-1") == ("xoxb-1", "C1")


# --- notify_scan_completed --------------------------------------------------


def test_notify_scan_completed_skips_when_no_slack():
    with patch.object(notifications, "_get_slack", return_value=None):
        sent = AsyncMock()
        with patch.object(notifications.slack_integration, "send_notification", sent):
            asyncio.run(notify_scan_completed("org-1", _scan_record()))
        sent.assert_not_called()


def test_notify_scan_completed_sends_message():
    sent = AsyncMock()
    with patch.object(notifications, "_get_slack", return_value=("tok", "C1")):
        with patch.object(notifications.slack_integration, "send_notification", sent):
            asyncio.run(notify_scan_completed("org-1", _scan_record([_violation("v1")])))
    sent.assert_awaited_once()
    kwargs = sent.await_args.kwargs
    assert "acme" in kwargs["text"]
    assert any(b["type"] == "header" for b in kwargs["blocks"])


def test_notify_scan_completed_truncates_violations():
    violations = [_violation(f"v{i}") for i in range(5)]
    sent = AsyncMock()
    with patch.object(notifications, "_get_slack", return_value=("tok", "C1")):
        with patch.object(notifications.slack_integration, "send_notification", sent):
            asyncio.run(notify_scan_completed("org-1", _scan_record(violations)))
    blocks = sent.await_args.kwargs["blocks"]
    detail_block = blocks[-1]["text"]["text"]
    assert "and 2 more" in detail_block


# --- notify_aws_scan_completed ----------------------------------------------


def test_notify_aws_scan_skips_when_no_slack():
    sent = AsyncMock()
    with patch.object(notifications, "_get_slack", return_value=None):
        with patch.object(notifications.slack_integration, "send_notification", sent):
            asyncio.run(notify_aws_scan_completed("org-1", _aws_record()))
    sent.assert_not_called()


def test_notify_aws_scan_sends_with_failures():
    sent = AsyncMock()
    with patch.object(notifications, "_get_slack", return_value=("tok", "C1")):
        with patch.object(notifications.slack_integration, "send_notification", sent):
            asyncio.run(notify_aws_scan_completed("org-1", _aws_record(failed_checks=4)))
    blocks = sent.await_args.kwargs["blocks"]
    assert "and 1 more" in blocks[-1]["text"]["text"]


# --- notify_system_change ---------------------------------------------------


def test_notify_system_change_created():
    sent = AsyncMock()
    system = MagicMock()
    system.name = "GitHub Copilot"
    system.owner = "Platform"
    system.risk_tier = "Tier 2"
    with patch.object(notifications, "_get_slack", return_value=("tok", "C1")):
        with patch.object(notifications.slack_integration, "send_notification", sent):
            asyncio.run(notify_system_change("org-1", system, "created"))
    text = sent.await_args.kwargs["text"]
    assert "registered" in text
    # owner/risk fields present for non-delete actions
    assert len(sent.await_args.kwargs["blocks"]) == 2


def test_notify_system_change_deleted_omits_fields():
    sent = AsyncMock()
    system = MagicMock()
    system.name = "Old System"
    with patch.object(notifications, "_get_slack", return_value=("tok", "C1")):
        with patch.object(notifications.slack_integration, "send_notification", sent):
            asyncio.run(notify_system_change("org-1", system, "deleted"))
    assert len(sent.await_args.kwargs["blocks"]) == 1
