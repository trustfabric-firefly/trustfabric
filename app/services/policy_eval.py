"""LLM-based evaluation of governance policies against real GitHub configuration.

This module bridges the "Governance Policies" (AI/manual/template created, stored
in Firestore under systems/{id}/policies/) with the compliance scan engine.

For each active governance policy, Claude reads the real GitHub config snapshot
and decides: compliant | violation — with evidence and a recommendation.

This gives full flexibility: any policy the user creates (via AI Generate, manual,
or template) is automatically evaluated on every scan, not just fixed hardcoded checks.
"""

from __future__ import annotations

import json
import re
from typing import Optional

from app.domain.models import (
    GovernancePolicy,
    GovernancePolicySeverity,
    ScanViolation,
    ViolationStatus,
)

_EVAL_SYSTEM_PROMPT = """You are a GitHub governance compliance evaluator for an enterprise AI governance platform.

You will receive:
1. A governance policy with a name, description, severity, and optional structured rules
2. A snapshot of the real GitHub organization / repository configuration

Your job: evaluate whether the current GitHub configuration complies with the policy.

Rules:
- Base your judgment ONLY on the data provided in the snapshot
- If the snapshot clearly lacks the data needed to evaluate the policy (e.g., a policy about
  database encryption when only GitHub config is available), mark it as not applicable
- Be strict — if any ambiguity exists, lean toward "violation" with a clear explanation
- Keep evidence and recommendation to 1–2 sentences each

Respond ONLY with a valid JSON object — no markdown, no explanation outside the JSON:
{
  "applicable": true | false,
  "status": "compliant" | "violation",
  "evidence": "one or two sentences describing exactly what you found",
  "recommendation": "one or two sentences on how to fix it (empty string if compliant)"
}"""


def build_github_snapshot(
    github_org: str,
    org_info: Optional[dict],
    copilot: Optional[dict],
    repo_stats: dict,
) -> dict:
    """Build a clean, LLM-readable snapshot of the GitHub configuration."""
    return {
        "organization": github_org,
        "org_two_factor_required": (
            org_info.get("two_factor_requirement_enabled") if org_info else "unknown"
        ),
        "org_default_repo_permission": (
            org_info.get("default_repository_permission") if org_info else "unknown"
        ),
        "org_members_can_create_public_repos": (
            org_info.get("members_can_create_public_repositories") if org_info else "unknown"
        ),
        "copilot_policy": (
            copilot
            if copilot
            else "not_available — personal account or org does not have Copilot Business/Enterprise"
        ),
        "repository_stats": repo_stats,
    }


def _parse_eval_response(raw: str) -> Optional[dict]:
    """Extract JSON from Claude response, handling markdown fences."""
    cleaned = raw.strip()
    fenced = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", cleaned, re.DOTALL)
    candidate = fenced.group(1).strip() if fenced else cleaned
    # Find first { ... } block if response has extra text
    brace_match = re.search(r"\{.*\}", candidate, re.DOTALL)
    if brace_match:
        candidate = brace_match.group(0)
    try:
        result = json.loads(candidate)
        if isinstance(result, dict):
            return result
    except (json.JSONDecodeError, ValueError):
        pass
    return None


async def evaluate_policy(
    policy: GovernancePolicy,
    github_snapshot: dict,
    api_key: str,
    model: str,
) -> Optional[ScanViolation]:
    """Evaluate a single governance policy against the GitHub snapshot using Claude.

    Returns a ScanViolation (compliant or violation) or None if:
    - the policy is not applicable to GitHub configuration
    - Claude fails or returns unparseable output
    """
    import anthropic

    rules_text = (
        json.dumps(policy.rules, indent=2) if policy.rules else "none specified"
    )

    user_message = (
        f"Policy:\n"
        f"- Name: {policy.name}\n"
        f"- Description: {policy.description}\n"
        f"- Category: {policy.category}\n"
        f"- Severity: {policy.severity}\n"
        f"- Structured rules: {rules_text}\n\n"
        f"GitHub Configuration Snapshot:\n"
        f"{json.dumps(github_snapshot, indent=2, default=str)}"
    )

    try:
        aclient = anthropic.AsyncAnthropic(api_key=api_key)
        message = await aclient.messages.create(
            model=model,
            max_tokens=300,
            temperature=0.1,
            system=_EVAL_SYSTEM_PROMPT,
            messages=[{"role": "user", "content": user_message}],
        )
        text_parts = [c.text for c in message.content if getattr(c, "type", "") == "text"]
        raw = "".join(text_parts).strip()
    except Exception:
        return None  # Never fail the scan due to LLM error

    result = _parse_eval_response(raw)
    if not result:
        return None

    if not result.get("applicable", True):
        return None  # Policy not relevant to GitHub config — skip silently

    passed = result.get("status") == "compliant"

    severity_map = {
        "low": GovernancePolicySeverity.low,
        "medium": GovernancePolicySeverity.medium,
        "high": GovernancePolicySeverity.high,
    }
    severity = severity_map.get(str(policy.severity).lower(), GovernancePolicySeverity.medium)

    risk_score_map = {
        GovernancePolicySeverity.high: 80,
        GovernancePolicySeverity.medium: 50,
        GovernancePolicySeverity.low: 20,
    }

    return ScanViolation(
        policy_id=policy.id,
        policy_name=policy.name,
        status=ViolationStatus.compliant if passed else ViolationStatus.violation,
        severity=severity,
        evidence=result.get("evidence", ""),
        recommendation="" if passed else result.get("recommendation", ""),
        risk_score=0 if passed else risk_score_map.get(severity, 50),
    )


async def evaluate_all_active_policies(
    github_snapshot: dict,
    api_key: str,
    model: str,
) -> list[ScanViolation]:
    """Fetch all active governance policies and evaluate each one against the GitHub snapshot.

    Results are appended to the scan after the built-in hardcoded checks.
    Individual policy failures never abort the scan.
    """
    from app.services.store import store

    policies = store.list_all_active_governance_policies()
    if not policies:
        return []

    results: list[ScanViolation] = []
    for policy in policies:
        try:
            item = await evaluate_policy(policy, github_snapshot, api_key, model)
            if item is not None:
                results.append(item)
        except Exception:
            pass  # Belt-and-suspenders: never let one policy crash the scan

    return results
