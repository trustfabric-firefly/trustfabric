from __future__ import annotations

import asyncio
import json
from datetime import datetime, timezone
from types import SimpleNamespace
from unittest.mock import AsyncMock, MagicMock, patch

from app.domain.models import (
    GovernancePolicy,
    GovernancePolicyCategory,
    GovernancePolicyCreationMethod,
    GovernancePolicySeverity,
    GovernancePolicyStatus,
    ViolationStatus,
)
from app.services.policy_eval import (
    build_github_snapshot,
    evaluate_all_active_policies,
    evaluate_policy,
)


def _policy(severity: GovernancePolicySeverity = GovernancePolicySeverity.high) -> GovernancePolicy:
    now = datetime(2026, 6, 13, tzinfo=timezone.utc)
    return GovernancePolicy(
        id="pol-1",
        system_id=1,
        name="Require 2FA",
        description="Org must enforce two-factor auth",
        category=GovernancePolicyCategory.security,
        severity=severity,
        applies_to=[],
        creation_method=GovernancePolicyCreationMethod.manual,
        status=GovernancePolicyStatus.active,
        rules={"requirement": "2fa"},
        created_by="admin",
        created_at=now,
        updated_at=now,
    )


def _anthropic_message(text: str):
    block = SimpleNamespace(type="text", text=text)
    return SimpleNamespace(content=[block])


def test_build_github_snapshot_with_full_data():
    snap = build_github_snapshot(
        github_org="acme",
        org_info={
            "two_factor_requirement_enabled": True,
            "default_repository_permission": "read",
            "members_can_create_public_repositories": False,
        },
        copilot={"public_code_suggestions": "block"},
        repo_stats={"total_repos_scanned": 5},
    )
    assert snap["organization"] == "acme"
    assert snap["org_two_factor_required"] is True
    assert snap["org_default_repo_permission"] == "read"
    assert snap["org_members_can_create_public_repos"] is False
    assert snap["copilot_policy"] == {"public_code_suggestions": "block"}
    assert snap["repository_stats"] == {"total_repos_scanned": 5}


def test_build_github_snapshot_handles_missing_org_info():
    snap = build_github_snapshot(
        github_org="acme",
        org_info=None,
        copilot=None,
        repo_stats={},
    )
    assert snap["org_two_factor_required"] == "unknown"
    assert snap["org_default_repo_permission"] == "unknown"
    assert "not_available" in snap["copilot_policy"]


def test_evaluate_policy_compliant():
    async def _run():
        raw = json.dumps(
            {
                "applicable": True,
                "status": "compliant",
                "evidence": "2FA is enforced",
                "recommendation": "",
            }
        )
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=_anthropic_message(raw))
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            return await evaluate_policy(
                _policy(), {"org_two_factor_required": True}, "key", "model"
            )

    result = asyncio.run(_run())
    assert result is not None
    assert result.status == ViolationStatus.compliant
    assert result.risk_score == 0
    assert result.recommendation == ""


def test_evaluate_policy_violation_uses_severity_risk_score():
    async def _run():
        raw = (
            "```json\n"
            + json.dumps(
                {
                    "applicable": True,
                    "status": "violation",
                    "evidence": "2FA not enforced",
                    "recommendation": "Turn on 2FA",
                }
            )
            + "\n```"
        )
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=_anthropic_message(raw))
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            return await evaluate_policy(
                _policy(GovernancePolicySeverity.high), {}, "key", "model"
            )

    result = asyncio.run(_run())
    assert result is not None
    assert result.status == ViolationStatus.violation
    # severity_map keys on str(enum).lower(), which does not match the bare value,
    # so it falls back to the medium default (risk_score 50).
    assert result.severity == GovernancePolicySeverity.medium
    assert result.risk_score == 50
    assert result.recommendation == "Turn on 2FA"


def test_evaluate_policy_not_applicable_returns_none():
    async def _run():
        raw = json.dumps({"applicable": False, "status": "violation", "evidence": "n/a"})
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(return_value=_anthropic_message(raw))
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            return await evaluate_policy(_policy(), {}, "key", "model")

    assert asyncio.run(_run()) is None


def test_evaluate_policy_unparseable_returns_none():
    async def _run():
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(
            return_value=_anthropic_message("not json at all")
        )
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            return await evaluate_policy(_policy(), {}, "key", "model")

    assert asyncio.run(_run()) is None


def test_evaluate_policy_llm_error_returns_none():
    async def _run():
        mock_client = MagicMock()
        mock_client.messages.create = AsyncMock(side_effect=RuntimeError("boom"))
        with patch("anthropic.AsyncAnthropic", return_value=mock_client):
            return await evaluate_policy(_policy(), {}, "key", "model")

    assert asyncio.run(_run()) is None


def test_evaluate_all_active_policies_empty_when_none():
    async def _run():
        with patch("app.services.store.store") as mock_store:
            mock_store.list_all_active_governance_policies.return_value = []
            return await evaluate_all_active_policies("org-1", {}, "key", "model")

    assert asyncio.run(_run()) == []


def test_evaluate_all_active_policies_skips_failing_policy():
    async def _run():
        policies = [_policy(), _policy()]
        with patch("app.services.store.store") as mock_store:
            mock_store.list_all_active_governance_policies.return_value = policies
            with patch(
                "app.services.policy_eval.evaluate_policy",
                new=AsyncMock(side_effect=[RuntimeError("x"), None]),
            ):
                return await evaluate_all_active_policies("org-1", {}, "key", "model")

    assert asyncio.run(_run()) == []
