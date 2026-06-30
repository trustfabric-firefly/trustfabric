from __future__ import annotations

from datetime import datetime, timezone

from app.domain.models import (
    FrameworkRequirementStatus,
    GitHubScannedConfig,
    GovernancePolicySeverity,
    ScanConfig,
    ScanRecord,
    ScanResults,
    ScanStatus,
    ScanViolation,
    ViolationStatus,
)
from app.services import frameworks


def _violation(policy_id: str, status: ViolationStatus, name: str = "x", evidence: str = "") -> ScanViolation:
    return ScanViolation(
        policy_id=policy_id,
        policy_name=name,
        status=status,
        severity=GovernancePolicySeverity.medium,
        evidence=evidence,
        recommendation="",
        risk_score=0 if status == ViolationStatus.compliant else 50,
    )


def _scan(compliant=None, violations=None) -> ScanRecord:
    return ScanRecord(
        scan_id="scan-1",
        organization="acme",
        timestamp=datetime(2026, 6, 13, tzinfo=timezone.utc),
        config=ScanConfig(scope="repositories", github_org="acme", policies_checked=[]),
        github_config=GitHubScannedConfig(),
        results=ScanResults(
            compliance_score=50,
            total_policies=len((compliant or []) + (violations or [])),
            violations=violations or [],
            compliant=compliant or [],
        ),
        duration_seconds=1.0,
        triggered_by="admin",
        status=ScanStatus.completed,
    )


def test_list_frameworks_returns_loaded_definitions():
    fws = frameworks.list_frameworks()
    assert isinstance(fws, list)
    assert len(fws) >= 1
    ids = {fw["id"] for fw in fws}
    # frameworks/ ships eu_ai_act, nist_csf, nist_rmf, soc2
    assert "soc2" in ids or "nist_rmf" in ids
    for fw in fws:
        assert "name" in fw
        assert "total_requirements" in fw
        assert fw["auto_requirements"] <= fw["total_requirements"]


def test_evaluate_framework_unknown_returns_none():
    result = frameworks.evaluate_framework(_scan(), "does-not-exist")
    assert result is None


def test_evaluate_framework_known_produces_result():
    fw_id = frameworks.list_frameworks()[0]["id"]
    scan = _scan(
        compliant=[_violation("chk_branch_protection", ViolationStatus.compliant)],
        violations=[_violation("chk_secret_scanning", ViolationStatus.violation)],
    )
    result = frameworks.evaluate_framework(scan, fw_id)
    assert result is not None
    assert result.framework_id == fw_id
    assert 0 <= result.overall_score <= 100
    assert result.total_requirements == len(result.requirements)
    assert (
        result.passed_requirements
        + result.partial_requirements
        + result.failed_requirements
        == result.total_requirements
    )


def test_evaluate_all_frameworks_returns_one_per_loaded():
    n = len(frameworks.list_frameworks())
    results = frameworks.evaluate_all_frameworks(_scan())
    assert len(results) == n


def test_get_scan_evidence_builds_passed_failed_map():
    scan = _scan(
        compliant=[_violation("chk_a", ViolationStatus.compliant)],
        violations=[_violation("chk_b", ViolationStatus.violation)],
    )
    evidence = frameworks._get_scan_evidence(scan)
    assert evidence == {"chk_a": True, "chk_b": False}


def test_custom_policy_categories_detected():
    scan = _scan(
        compliant=[_violation("uuid-1234", ViolationStatus.compliant)],
    )
    cats = frameworks._get_active_policy_categories(scan)
    assert "_custom_policy_present" in cats


def test_custom_policy_keywords_collected_lowercased():
    scan = _scan(
        compliant=[
            _violation("uuid-1", ViolationStatus.compliant, name="Encryption At Rest", evidence="AES256 Used")
        ],
    )
    kw = frameworks._get_active_policy_keywords(scan)
    assert "encryption at rest" in kw
    assert "aes256 used" in kw


def test_chk_prefixed_policies_excluded_from_custom_keywords():
    scan = _scan(
        compliant=[_violation("chk_branch_protection", ViolationStatus.compliant, name="Branch")],
    )
    assert frameworks._get_active_policy_keywords(scan) == set()


def test_evaluate_requirement_manual_no_checklist_is_manual():
    req = {"id": "r1", "title": "Manual control", "auto_evaluable": False}
    result = frameworks._evaluate_requirement(req, {}, set(), set(), {})
    assert result.status == FrameworkRequirementStatus.manual
    assert result.score == 0.0
    assert result.auto_evaluable is False


def test_evaluate_requirement_manual_fully_attested_passes():
    req = {
        "id": "r1",
        "title": "Manual control",
        "auto_evaluable": False,
        "manual_checklist": ["item a", "item b"],
    }
    attestations = {"r1_0": True, "r1_1": True}
    result = frameworks._evaluate_requirement(req, {}, set(), set(), attestations)
    assert result.status == FrameworkRequirementStatus.passed
    assert result.score == 1.0


def test_evaluate_requirement_manual_partial_attested():
    req = {
        "id": "r1",
        "title": "Manual control",
        "auto_evaluable": False,
        "manual_checklist": ["a", "b"],
    }
    result = frameworks._evaluate_requirement(req, {}, set(), set(), {"r1_0": True})
    assert result.status == FrameworkRequirementStatus.partial
    assert result.score == 0.5


def test_evaluate_requirement_auto_all_checks_pass():
    req = {
        "id": "r1",
        "title": "Auto control",
        "auto_evaluable": True,
        "checks": [
            {"check_id": "chk_a", "weight": 1},
            {"check_id": "chk_b", "weight": 1},
        ],
        "pass_threshold": 0.5,
    }
    evidence = {"chk_a": True, "chk_b": True}
    result = frameworks._evaluate_requirement(req, evidence, set(), set(), {})
    assert result.status == FrameworkRequirementStatus.passed
    assert result.score == 1.0
    assert len(result.evidence) == 2


def test_evaluate_requirement_auto_all_checks_fail():
    req = {
        "id": "r1",
        "title": "Auto control",
        "auto_evaluable": True,
        "checks": [{"check_id": "chk_a", "weight": 1}],
        "pass_threshold": 0.5,
    }
    result = frameworks._evaluate_requirement(req, {"chk_a": False}, set(), set(), {})
    assert result.status == FrameworkRequirementStatus.failed
    assert result.score == 0.0


def test_evaluate_requirement_auto_partial_below_threshold():
    req = {
        "id": "r1",
        "title": "Auto control",
        "auto_evaluable": True,
        "checks": [
            {"check_id": "chk_a", "weight": 1},
            {"check_id": "chk_b", "weight": 1},
            {"check_id": "chk_c", "weight": 1},
        ],
        "pass_threshold": 0.9,
    }
    evidence = {"chk_a": True, "chk_b": False, "chk_c": False}
    result = frameworks._evaluate_requirement(req, evidence, set(), set(), {})
    # score = 1/3 ~ 0.333 < 0.9 but > 0 -> partial
    assert result.status == FrameworkRequirementStatus.partial


def test_evaluate_requirement_policy_keyword_coverage_adds_weight():
    req = {
        "id": "r1",
        "title": "Auto control",
        "auto_evaluable": True,
        "checks": [],
        "policy_keywords": ["encryption"],
        "pass_threshold": 0.5,
    }
    policy_text = {"data encryption at rest enabled"}
    result = frameworks._evaluate_requirement(req, {}, set(), policy_text, {})
    assert result.status == FrameworkRequirementStatus.passed
    assert result.score == 1.0
