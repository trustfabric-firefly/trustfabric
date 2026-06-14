from __future__ import annotations

import time
from datetime import datetime
from uuid import uuid4

from app.core.config import settings
from app.domain.models import (
    GitHubScannedConfig,
    ScanConfig,
    ScanRecord,
    ScanResults,
    ScanStatus,
    ScanViolation,
    ViolationStatus,
    GovernancePolicySeverity,
)
from app.integrations import github as gh
from app.services.policy_eval import build_github_snapshot, evaluate_all_active_policies
from app.services.store import store

# Built-in checks — each maps to a real GitHub API measurement.
# tier: "personal" checks run on repo-level data (always available).
# tier: "enterprise" checks require Copilot Business/Enterprise org access;
#       they are skipped gracefully when copilot/org data is None.
CHECKS = [
    {
        "id": "chk_branch_protection",
        "name": "Branch Protection on Default Branch",
        "severity": GovernancePolicySeverity.high,
        "pass_evidence": lambda p, t: f"Branch protection enabled on {p}/{t} repositories",
        "fail_evidence": lambda p, t: f"Only {p}/{t} repositories have branch protection enabled on their default branch",
        "recommendation": "Go to repo Settings → Branches → Add a protection rule for your default branch",
        "risk_score": 80,
    },
    {
        "id": "chk_pr_reviews",
        "name": "Pull Request Reviews Required",
        "severity": GovernancePolicySeverity.medium,
        "pass_evidence": lambda p, t: f"PR review requirements configured on {p}/{t} protected branches",
        "fail_evidence": lambda p, t: f"Only {p}/{t} repositories require PR reviews before merging",
        "recommendation": "In branch protection rules, enable 'Require pull request reviews before merging'",
        "risk_score": 60,
    },
    {
        "id": "chk_vulnerability_alerts",
        "name": "Vulnerability Alerts Enabled",
        "severity": GovernancePolicySeverity.high,
        "pass_evidence": lambda p, t: f"Dependabot vulnerability alerts active on {p}/{t} repositories",
        "fail_evidence": lambda p, t: f"Vulnerability alerts disabled on {t - p}/{t} repositories",
        "recommendation": "Go to repo Settings → Security → Enable Dependabot alerts",
        "risk_score": 75,
    },
    {
        "id": "chk_actions_restricted",
        "name": "GitHub Actions Restricted to Trusted Sources",
        "severity": GovernancePolicySeverity.medium,
        "tier": "personal",
        "pass_evidence": lambda p, t: f"Actions restricted to local/selected sources on {p}/{t} repositories",
        "fail_evidence": lambda p, t: f"{t - p}/{t} repositories allow all GitHub Actions (supply-chain risk)",
        "recommendation": "Go to repo Settings → Actions → General → Change to 'Allow local and select actions'",
        "risk_score": 55,
    },
    {
        "id": "chk_secret_scanning",
        "name": "Secret Scanning Enabled",
        "severity": GovernancePolicySeverity.high,
        "tier": "personal",
        "pass_evidence": lambda p, t: f"Secret scanning active on {p}/{t} repositories — hardcoded credentials will be detected",
        "fail_evidence": lambda p, t: f"Secret scanning disabled on {t - p}/{t} repositories — hardcoded API keys and tokens will NOT be caught",
        "recommendation": "Go to repo Settings → Security → Code security and analysis → Enable Secret scanning",
        "risk_score": 85,
    },
    {
        "id": "chk_secret_push_protection",
        "name": "Secret Scanning Push Protection Enabled",
        "severity": GovernancePolicySeverity.high,
        "tier": "personal",
        "pass_evidence": lambda p, t: f"Push protection active on {p}/{t} repositories — secrets are blocked before they land",
        "fail_evidence": lambda p, t: f"Push protection disabled on {t - p}/{t} repositories — secrets can still be pushed and are only detected after the fact",
        "recommendation": "Go to repo Settings → Security → Code security and analysis → Enable 'Push protection' under Secret scanning",
        "risk_score": 90,
    },
    # ── Enterprise-only checks (require Copilot Business/Enterprise) ──────────
    {
        "id": "chk_public_code_blocked",
        "name": "Copilot Public Code Suggestions Blocked",
        "severity": GovernancePolicySeverity.high,
        "tier": "enterprise",
        "recommendation": "In your GitHub org Copilot policy, set 'Suggestions matching public code' to 'Block'",
        "risk_score": 85,
    },
    {
        "id": "chk_copilot_cli_disabled",
        "name": "Copilot CLI Feature Disabled (or Controlled)",
        "severity": GovernancePolicySeverity.medium,
        "tier": "enterprise",
        "recommendation": "Review your org Copilot policy for CLI access and disable if not required by your security policy",
        "risk_score": 50,
    },
    {
        "id": "chk_seat_management",
        "name": "Copilot Seat Assignment Restricted",
        "severity": GovernancePolicySeverity.medium,
        "tier": "enterprise",
        "recommendation": "Set Copilot seat management to 'assign_selected' so only approved users get access",
        "risk_score": 60,
    },
    {
        "id": "chk_inactive_seats",
        "name": "Copilot Inactive Seat Ratio Below 30%",
        "severity": GovernancePolicySeverity.low,
        "tier": "enterprise",
        "recommendation": "Review Copilot seat usage and reclaim licenses from users who have not been active in the last 30 days",
        "risk_score": 30,
    },
    {
        "id": "chk_org_two_factor",
        "name": "Organization Two-Factor Authentication Required",
        "severity": GovernancePolicySeverity.high,
        "tier": "enterprise",
        "recommendation": "In GitHub org Settings → Authentication security, enable 'Require two-factor authentication for everyone'",
        "risk_score": 90,
    },
]

# Add tier="personal" to the first four checks for consistency
for _chk in CHECKS:
    _chk.setdefault("tier", "personal")


async def run_scan(
    user_id: str,
    organization_id: str,
    github_org: str,
    triggered_by: str,
) -> ScanRecord:
    start = time.monotonic()

    conn = store.get_github_connection(organization_id)
    if not conn or not conn.get("github_access_token"):
        raise ValueError("GitHub is not connected. Connect your GitHub account in Settings first.")
    token = conn["github_access_token"]
    github_login = conn.get("github_login", "")

    if github_org and github_org != github_login:
        repos = await gh.get_org_repos(token, github_org)
        if not repos:
            raise ValueError(
                f"No repositories found for GitHub organization '{github_org}'. "
                "If these are private org repositories, reconnect GitHub with repository read access."
            )
    else:
        repos = await gh.get_user_repos(token)

    # Limit to 10 most-recently-pushed non-fork repos for speed
    repos = [r for r in repos if not r.get("fork")][:10]
    total = len(repos)

    if total == 0:
        raise ValueError("No repositories found to scan.")

    # --- Gather GitHub data per repo ---
    repo_checks = {
        "chk_branch_protection": {"passed": [], "failed": []},
        "chk_pr_reviews": {"passed": [], "failed": []},
        "chk_vulnerability_alerts": {"passed": [], "failed": []},
        "chk_actions_restricted": {"passed": [], "failed": []},
        "chk_secret_scanning": {"passed": [], "failed": []},
        "chk_secret_push_protection": {"passed": [], "failed": []},
    }
    scanned_repositories: list[str] = []

    for repo in repos:
        owner = repo["owner"]["login"]
        name = repo["name"]
        default_branch = repo.get("default_branch", "main")
        scanned_repositories.append(name)
        repo_details = await gh.get_repo(token, owner, name) or repo

        protection = await gh.get_branch_protection(token, owner, name, default_branch)
        if protection:
            repo_checks["chk_branch_protection"]["passed"].append(name)
        else:
            repo_checks["chk_branch_protection"]["failed"].append(name)

        if protection and protection.get("required_pull_request_reviews"):
            repo_checks["chk_pr_reviews"]["passed"].append(name)
        else:
            repo_checks["chk_pr_reviews"]["failed"].append(name)

        if repo_details.get("has_vulnerability_alerts"):
            repo_checks["chk_vulnerability_alerts"]["passed"].append(name)
        else:
            repo_checks["chk_vulnerability_alerts"]["failed"].append(name)

        actions = await gh.get_actions_permissions(token, owner, name)
        if actions and actions.get("allowed_actions") in ("local_only", "selected"):
            repo_checks["chk_actions_restricted"]["passed"].append(name)
        else:
            repo_checks["chk_actions_restricted"]["failed"].append(name)

        # Secret scanning — available on public repos for free; private repos need GitHub Advanced Security
        sec = repo_details.get("security_and_analysis") or repo.get("security_and_analysis") or {}
        if (sec.get("secret_scanning") or {}).get("status") == "enabled":
            repo_checks["chk_secret_scanning"]["passed"].append(name)
        else:
            repo_checks["chk_secret_scanning"]["failed"].append(name)
        if (sec.get("secret_scanning_push_protection") or {}).get("status") == "enabled":
            repo_checks["chk_secret_push_protection"]["passed"].append(name)
        else:
            repo_checks["chk_secret_push_protection"]["failed"].append(name)

    branch_protected = len(repo_checks["chk_branch_protection"]["passed"])
    pr_required = len(repo_checks["chk_pr_reviews"]["passed"])
    vuln_enabled = len(repo_checks["chk_vulnerability_alerts"]["passed"])
    actions_restricted = len(repo_checks["chk_actions_restricted"]["passed"])
    secret_scanning_enabled = len(repo_checks["chk_secret_scanning"]["passed"])
    push_protection_enabled = len(repo_checks["chk_secret_push_protection"]["passed"])

    # Copilot config + org info (enterprise only — None for personal accounts)
    copilot = await gh.get_copilot_config(token, github_org)
    org_info = await gh.get_org_info(token, github_org)
    seats_data = await gh.get_copilot_seats(token, github_org) if copilot else None

    # --- Determine which checks to run based on active scan policies ---
    active_policies = store.get_scan_policies(organization_id)
    enabled_check_ids = {p.check_id for p in active_policies if p.enabled}
    active_checks = [c for c in CHECKS if c["id"] in enabled_check_ids]

    threshold = max(1, (total + 1) // 2)  # more than half

    violations: list[ScanViolation] = []
    compliant: list[ScanViolation] = []

    for chk in active_checks:
        chk_tier = chk.get("tier", "personal")

        if chk_tier == "personal":
            # Repo-level checks — evaluated as pass/fail ratio
            outcomes = repo_checks.get(chk["id"], {"passed": [], "failed": []})
            passed_count = len(outcomes["passed"])
            passed = passed_count >= threshold
            pass_ev = chk.get("pass_evidence", lambda p, t: "Check passed")(passed_count, total)
            fail_ev = chk.get("fail_evidence", lambda p, t: "Check failed")(passed_count, total)
            evidence = pass_ev if passed else fail_ev
            affected_repositories = outcomes["failed"] if not passed else outcomes["passed"]

        else:
            # Enterprise checks — skip when Copilot/org data unavailable
            if copilot is None and chk["id"] != "chk_org_two_factor":
                continue  # no Copilot Business — check not applicable
            if chk["id"] == "chk_org_two_factor" and org_info is None:
                continue  # no org access — skip

            if chk["id"] == "chk_public_code_blocked":
                passed = copilot.get("public_code_suggestions") == "block"  # type: ignore[union-attr]
                evidence = (
                    "Public code suggestions are blocked org-wide"
                    if passed
                    else f"Public code suggestions policy is '{copilot.get('public_code_suggestions', 'unknown')}' — should be 'block'"  # type: ignore[union-attr]
                )

            elif chk["id"] == "chk_copilot_cli_disabled":
                cli_val = copilot.get("cli") if copilot else None  # type: ignore[union-attr]
                passed = cli_val in (None, "disabled", "unconfigured")
                evidence = (
                    f"Copilot CLI is {'disabled' if cli_val in (None, 'disabled', 'unconfigured') else cli_val}"
                )

            elif chk["id"] == "chk_seat_management":
                setting = copilot.get("seat_management_setting") if copilot else None  # type: ignore[union-attr]
                passed = setting == "assign_selected"
                evidence = (
                    "Seat assignment is restricted to selected users"
                    if passed
                    else f"Seat management is set to '{setting}' — should be 'assign_selected'"
                )

            elif chk["id"] == "chk_inactive_seats":
                if seats_data:
                    total_seats = seats_data.get("total_seats", 0)
                    seats_list = seats_data.get("seats", [])
                    inactive = sum(1 for s in seats_list if not s.get("last_activity_at"))
                    ratio = (inactive / total_seats) if total_seats > 0 else 0
                    passed = ratio < 0.30
                    evidence = (
                        f"Inactive seat ratio is {round(ratio * 100)}% ({inactive}/{total_seats} seats)"
                    )
                else:
                    continue  # No seat data available

            elif chk["id"] == "chk_org_two_factor":
                passed = bool(org_info.get("two_factor_requirement_enabled")) if org_info else False  # type: ignore[union-attr]
                evidence = (
                    "Two-factor authentication is required for all org members"
                    if passed
                    else "Two-factor authentication is NOT enforced for org members"
                )

            else:
                continue
            affected_repositories = []

        item = ScanViolation(
            policy_id=chk["id"],
            policy_name=chk["name"],
            status=ViolationStatus.compliant if passed else ViolationStatus.violation,
            severity=chk["severity"],
            evidence=evidence,
            recommendation="" if passed else chk["recommendation"],
            risk_score=0 if passed else chk["risk_score"],
            affected_repositories=affected_repositories,
        )
        (compliant if passed else violations).append(item)

    # --- LLM evaluation of custom governance policies ---
    # Runs after hardcoded checks. Evaluates every active GovernancePolicy stored
    # in Firestore (AI-generated, manual, or template) against the real GitHub data.
    # Skipped when Claude API key is not configured.
    if settings.claude_api_key:
        github_snapshot = build_github_snapshot(
            github_org=github_org,
            org_info=org_info,
            copilot=copilot,
            repo_stats={
                "total_repos_scanned": total,
                "repos_with_branch_protection": branch_protected,
                "repos_requiring_pr_reviews": pr_required,
                "repos_with_vulnerability_alerts": vuln_enabled,
                "repos_with_restricted_actions": actions_restricted,
            },
        )
        custom_results = await evaluate_all_active_policies(
            organization_id=organization_id,
            github_snapshot=github_snapshot,
            api_key=settings.claude_api_key,
            model=settings.anthropic_model,
        )
        for item in custom_results:
            if item.status == ViolationStatus.compliant:
                compliant.append(item)
            else:
                violations.append(item)

    total_checks = len(compliant) + len(violations)
    score = round((len(compliant) / total_checks) * 100) if total_checks > 0 else 100

    # --- Build github_config summary ---
    github_config = GitHubScannedConfig(
        enabled_models=copilot.get("enabled_models", []) if copilot else [],
        cli_enabled=copilot.get("cli") == "enabled" if copilot else False,
        ide_features={"suggestions": True},
        secret_scanning_enabled=vuln_enabled >= threshold,
        code_review_required=pr_required >= threshold,
    )

    record = ScanRecord(
        scan_id=str(uuid4()),
        organization=github_org,
        timestamp=datetime.utcnow(),
        config=ScanConfig(
            scope="repositories",
            github_org=github_org,
            policies_checked=[c["id"] for c in CHECKS],
        ),
        github_config=github_config,
        results=ScanResults(
            compliance_score=score,
            total_policies=total_checks,
            violations=violations,
            compliant=compliant,
            scanned_repositories=scanned_repositories,
        ),
        duration_seconds=round(time.monotonic() - start, 2),
        triggered_by=triggered_by,
        status=ScanStatus.completed,
    )

    store.save_scan(user_id, organization_id, record)
    store.link_scan_to_systems(record, organization_id)
    return record
