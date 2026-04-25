"""Framework compliance evaluation engine.

Loads framework YAML definitions from app/frameworks/ and evaluates any
ScanRecord against them to produce a FrameworkResult with requirement-level
pass/fail and an overall compliance score.

Adding a new framework: drop a YAML file in app/frameworks/ — zero code changes.
Adding a new scan check: reference its check_id in the relevant YAML requirements.
"""

from __future__ import annotations

import os
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional

import yaml

from app.domain.models import (
    FrameworkRequirementResult,
    FrameworkRequirementStatus,
    FrameworkResult,
    ScanRecord,
    ViolationStatus,
)

_FRAMEWORKS_DIR = Path(__file__).parent.parent / "frameworks"


@lru_cache(maxsize=None)
def _load_all_frameworks() -> Dict[str, dict]:
    """Load and cache all YAML framework definitions at startup."""
    frameworks: Dict[str, dict] = {}
    for path in sorted(_FRAMEWORKS_DIR.glob("*.yaml")):
        try:
            with open(path, encoding="utf-8") as f:
                data = yaml.safe_load(f)
            if isinstance(data, dict) and "id" in data:
                frameworks[data["id"]] = data
        except Exception:
            pass  # skip malformed files
    return frameworks


def list_frameworks() -> List[dict]:
    """Return metadata for all loaded frameworks (no requirement detail)."""
    return [
        {
            "id": fw["id"],
            "name": fw["name"],
            "short_name": fw.get("short_name", fw["id"]),
            "version": fw.get("version", ""),
            "scope": fw.get("scope", ""),
            "total_requirements": len(fw.get("requirements", [])),
            "auto_requirements": sum(
                1 for r in fw.get("requirements", []) if r.get("auto_evaluable", False)
            ),
        }
        for fw in _load_all_frameworks().values()
    ]


def _get_scan_evidence(scan: ScanRecord) -> dict:
    """Build a flat lookup of check_id → passed(bool) from a scan record."""
    evidence: dict[str, bool] = {}
    for item in scan.results.violations:
        evidence[item.policy_id] = False
    for item in scan.results.compliant:
        evidence[item.policy_id] = True
    return evidence


def _get_active_policy_categories(scan: ScanRecord) -> set[str]:
    """Return the set of policy categories that have at least one compliant custom policy."""
    categories: set[str] = set()
    for item in scan.results.compliant:
        # Custom policies have Firestore UUID IDs (not chk_* prefixed)
        if not item.policy_id.startswith("chk_"):
            # We can't look up the category from the scan record alone,
            # so we pass through all compliant custom policies as satisfying
            # any keyword-based requirement.
            categories.add("_custom_policy_present")
    return categories


def _get_active_policy_keywords(scan: ScanRecord) -> set[str]:
    """Collect all policy names/evidence from compliant custom policies as searchable text."""
    text_corpus: set[str] = set()
    for item in [*scan.results.compliant, *scan.results.violations]:
        if not item.policy_id.startswith("chk_"):
            text_corpus.add(item.policy_name.lower())
            text_corpus.add(item.evidence.lower())
    return text_corpus


def _evaluate_requirement(
    req: dict,
    check_evidence: dict[str, bool],
    active_categories: set[str],
    policy_text: set[str],
    attestations: dict[str, bool],
) -> FrameworkRequirementResult:
    """Evaluate a single requirement and return its result."""
    req_id = req["id"]
    auto_evaluable = req.get("auto_evaluable", False)

    if not auto_evaluable:
        # Manual requirement — check if user has attested all checklist items
        checklist = req.get("manual_checklist", [])
        if not checklist:
            status = FrameworkRequirementStatus.manual
            score = 0.0
        else:
            # Each checklist item can be attested individually
            # attestations key = f"{req_id}_{item_index}"
            attested_count = sum(
                1 for i in range(len(checklist))
                if attestations.get(f"{req_id}_{i}", False)
            )
            score = attested_count / len(checklist)
            if score == 1.0:
                status = FrameworkRequirementStatus.passed
            elif score > 0:
                status = FrameworkRequirementStatus.partial
            else:
                status = FrameworkRequirementStatus.manual

        return FrameworkRequirementResult(
            id=req_id,
            article=req.get("article", req_id),
            title=req["title"],
            description=req.get("description", ""),
            status=status,
            score=score,
            auto_evaluable=False,
            evidence=[],
            gaps=[f"Manual attestation required: {item}" for item in req.get("manual_checklist", [])
                  if not attestations.get(f"{req_id}_{req.get('manual_checklist', []).index(item)}", False)],
            checklist=req.get("manual_checklist", []),
            checklist_done=[
                attestations.get(f"{req_id}_{i}", False)
                for i in range(len(req.get("manual_checklist", [])))
            ],
        )

    # Auto-evaluable requirement
    checks: List[dict] = req.get("checks", [])
    policy_categories: List[str] = req.get("policy_categories", [])
    policy_keywords: List[str] = req.get("policy_keywords", [])
    threshold: float = req.get("pass_threshold", 0.5)

    passed_weight = 0.0
    total_weight = 0.0
    evidence_lines: List[str] = []
    gap_lines: List[str] = []

    # Evaluate each mapped check
    for chk in checks:
        cid = chk["check_id"]
        w = float(chk.get("weight", 1))
        total_weight += w
        if check_evidence.get(cid) is True:
            passed_weight += w
            evidence_lines.append(f"{cid}: passed ({chk.get('rationale', '')})")
        elif check_evidence.get(cid) is False:
            gap_lines.append(f"{cid}: failed — {chk.get('rationale', '')}")
        else:
            # Check not run (not in scan results) — treat as gap with 0 weight
            gap_lines.append(f"{cid}: not evaluated in this scan")

    # Governance policy categories contribute bonus weight
    if policy_categories or policy_keywords:
        policy_weight = float(len(policy_categories) + len(policy_keywords))
        # Check if any active custom policies cover these categories/keywords
        has_policy_coverage = (
            bool(active_categories & set(policy_categories))
            or any(
                kw.lower() in text
                for kw in policy_keywords
                for text in policy_text
            )
        )
        total_weight += policy_weight
        if has_policy_coverage:
            passed_weight += policy_weight
            evidence_lines.append("Active governance policies provide additional coverage")
        else:
            gap_lines.append("No active governance policies cover this requirement area")

    if total_weight == 0:
        score = 0.0
    else:
        score = passed_weight / total_weight

    if score >= threshold:
        status = FrameworkRequirementStatus.passed
    elif score > 0:
        status = FrameworkRequirementStatus.partial
    else:
        status = FrameworkRequirementStatus.failed

    return FrameworkRequirementResult(
        id=req_id,
        article=req.get("article", req_id),
        title=req["title"],
        description=req.get("description", ""),
        status=status,
        score=round(score, 3),
        auto_evaluable=True,
        evidence=evidence_lines,
        gaps=gap_lines,
        checklist=[],
        checklist_done=[],
    )


def evaluate_framework(
    scan: ScanRecord,
    framework_id: str,
    attestations: Optional[Dict[str, bool]] = None,
) -> Optional[FrameworkResult]:
    """Evaluate a scan record against a named framework.

    Returns None if the framework_id is not found.
    attestations: dict mapping f"{req_id}_{item_index}" → True/False for manual items.
    """
    from datetime import datetime

    frameworks = _load_all_frameworks()
    fw = frameworks.get(framework_id)
    if not fw:
        return None

    attest = attestations or {}
    check_evidence = _get_scan_evidence(scan)
    active_categories = _get_active_policy_categories(scan)
    policy_text = _get_active_policy_keywords(scan)

    req_results: List[FrameworkRequirementResult] = []
    for req in fw.get("requirements", []):
        req_results.append(
            _evaluate_requirement(req, check_evidence, active_categories, policy_text, attest)
        )

    auto_results = [r for r in req_results if r.auto_evaluable]
    manual_results = [r for r in req_results if not r.auto_evaluable]

    auto_passed = sum(1 for r in auto_results if r.status == FrameworkRequirementStatus.passed)
    auto_partial = sum(1 for r in auto_results if r.status == FrameworkRequirementStatus.partial)
    manual_attested = sum(1 for r in manual_results if r.status == FrameworkRequirementStatus.passed)

    total = len(req_results)
    passed_total = auto_passed + manual_attested
    partial_total = auto_partial

    # Overall score: fully passed count (partial counts 0.5)
    score_numerator = passed_total + (partial_total * 0.5)
    overall_score = round((score_numerator / total) * 100) if total > 0 else 0

    # Auto-only score (for transparency about what we can verify)
    auto_score = round((auto_passed / len(auto_results)) * 100) if auto_results else 0

    return FrameworkResult(
        framework_id=fw["id"],
        framework_name=fw["name"],
        framework_short_name=fw.get("short_name", fw["id"]),
        framework_version=fw.get("version", ""),
        scan_id=scan.scan_id,
        evaluated_at=datetime.utcnow(),
        overall_score=overall_score,
        auto_score=auto_score,
        total_requirements=total,
        auto_requirements=len(auto_results),
        manual_requirements=len(manual_results),
        passed_requirements=passed_total,
        partial_requirements=partial_total,
        failed_requirements=total - passed_total - partial_total,
        requirements=req_results,
    )


def evaluate_all_frameworks(
    scan: ScanRecord,
    attestations: Optional[Dict[str, Dict[str, bool]]] = None,
) -> List[FrameworkResult]:
    """Evaluate a scan against all loaded frameworks.

    attestations: dict mapping framework_id → {req_id_item_index: bool}
    """
    all_attest = attestations or {}
    results = []
    for fw_id in _load_all_frameworks():
        result = evaluate_framework(scan, fw_id, all_attest.get(fw_id))
        if result:
            results.append(result)
    return results
