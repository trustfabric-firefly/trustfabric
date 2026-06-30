from __future__ import annotations

import asyncio
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

from app.domain.models import GovernancePolicySeverity, ScanStatus
from app.services import scan
from app.services.scan import CHECKS, run_scan


# --- Static CHECKS config ---------------------------------------------------


def test_all_checks_have_required_metadata():
    for chk in CHECKS:
        assert chk["id"].startswith("chk_")
        assert isinstance(chk["name"], str) and chk["name"]
        assert isinstance(chk["severity"], GovernancePolicySeverity)
        assert isinstance(chk["risk_score"], int)
        assert chk["tier"] in ("personal", "enterprise")
        assert "recommendation" in chk


def test_check_ids_are_unique():
    ids = [c["id"] for c in CHECKS]
    assert len(ids) == len(set(ids))


def test_personal_checks_have_evidence_callables():
    personal = [c for c in CHECKS if c["tier"] == "personal"]
    assert personal
    for chk in personal:
        assert callable(chk["pass_evidence"])
        assert callable(chk["fail_evidence"])
        # callables accept (passed, total)
        assert isinstance(chk["pass_evidence"](2, 3), str)
        assert isinstance(chk["fail_evidence"](1, 3), str)


def test_enterprise_checks_present():
    enterprise_ids = {c["id"] for c in CHECKS if c["tier"] == "enterprise"}
    assert "chk_org_two_factor" in enterprise_ids
    assert "chk_public_code_blocked" in enterprise_ids


def test_fail_evidence_includes_counts():
    branch = next(c for c in CHECKS if c["id"] == "chk_branch_protection")
    text = branch["fail_evidence"](2, 5)
    assert "2" in text and "5" in text


# --- run_scan error guards --------------------------------------------------


def test_run_scan_raises_when_github_not_connected():
    async def _run():
        mock_store = MagicMock()
        mock_store.get_github_connection.return_value = None
        with patch.object(scan, "store", mock_store):
            await run_scan("u1", "org-1", "acme", "admin")

    with pytest.raises(ValueError, match="GitHub is not connected"):
        asyncio.run(_run())


def test_run_scan_raises_when_token_missing():
    async def _run():
        mock_store = MagicMock()
        mock_store.get_github_connection.return_value = {"github_login": "acme"}
        with patch.object(scan, "store", mock_store):
            await run_scan("u1", "org-1", "acme", "admin")

    with pytest.raises(ValueError, match="GitHub is not connected"):
        asyncio.run(_run())


def test_run_scan_raises_when_no_org_repos():
    async def _run():
        mock_store = MagicMock()
        mock_store.get_github_connection.return_value = {
            "github_access_token": "tok",
            "github_login": "me",
        }
        with patch.object(scan, "store", mock_store):
            with patch.object(scan.gh, "get_org_repos", new=AsyncMock(return_value=[])):
                await run_scan("u1", "org-1", "acme-org", "admin")

    with pytest.raises(ValueError, match="No repositories found for GitHub organization"):
        asyncio.run(_run())


def test_run_scan_raises_when_user_repos_all_forks():
    async def _run():
        mock_store = MagicMock()
        mock_store.get_github_connection.return_value = {
            "github_access_token": "tok",
            "github_login": "me",
        }
        forks = [{"fork": True, "name": "f1", "owner": {"login": "me"}}]
        with patch.object(scan, "store", mock_store):
            with patch.object(scan.gh, "get_user_repos", new=AsyncMock(return_value=forks)):
                await run_scan("u1", "org-1", "me", "admin")

    with pytest.raises(ValueError, match="No repositories found to scan"):
        asyncio.run(_run())


def test_run_scan_completes_with_personal_check(monkeypatch):
    """End-to-end happy path with one repo and one enabled personal check."""
    from app.core.config import settings

    monkeypatch.setattr(settings, "claude_api_key", "")  # skip LLM eval branch

    async def _run():
        mock_store = MagicMock()
        mock_store.get_github_connection.return_value = {
            "github_access_token": "tok",
            "github_login": "me",
        }
        # only branch protection enabled
        enabled_policy = MagicMock()
        enabled_policy.check_id = "chk_branch_protection"
        enabled_policy.enabled = True
        mock_store.get_scan_policies.return_value = [enabled_policy]

        repo = {"name": "repo1", "owner": {"login": "me"}, "default_branch": "main", "fork": False}

        with patch.object(scan, "store", mock_store):
            with patch.object(scan.gh, "get_user_repos", new=AsyncMock(return_value=[repo])):
                with patch.object(scan.gh, "get_repo", new=AsyncMock(return_value=repo)):
                    with patch.object(
                        scan.gh, "get_branch_protection", new=AsyncMock(return_value={"required_pull_request_reviews": {}})
                    ):
                        with patch.object(scan.gh, "get_actions_permissions", new=AsyncMock(return_value=None)):
                            with patch.object(scan.gh, "get_copilot_config", new=AsyncMock(return_value=None)):
                                with patch.object(scan.gh, "get_org_info", new=AsyncMock(return_value=None)):
                                    return await run_scan("u1", "org-1", "me", "admin")

    record = asyncio.run(_run())
    assert record.status == ScanStatus.completed
    assert record.results.scanned_repositories == ["repo1"]
    # branch protection passed (1/1 >= threshold)
    assert record.results.compliance_score == 100
    assert any(v.policy_id == "chk_branch_protection" for v in record.results.compliant)
