from __future__ import annotations

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException, status

from app.core.config import settings
from app.domain.models import OrganizationCopilotQuota, OrganizationCopilotQuotaUpdate, OrganizationCopilotUsage
from app.domain.models import OrganizationCopilotQuota, OrganizationCopilotQuotaUpdate
from app.services import copilot_quota


@pytest.fixture(autouse=True)
def _mock_store():
    with patch("app.services.copilot_quota.store") as mock_store:
        mock_store.get_copilot_quota.return_value = None
        mock_store.get_organization.return_value = MagicMock(plan="trial")
        mock_store.get_copilot_usage.return_value = MagicMock(
            organization_id="org-1",
            period="2026-06",
            request_count=0,
            estimated_cost_usd=0.0,
        )
        mock_store.get_user_daily_copilot_requests.return_value = 0
        yield mock_store


def test_assert_copilot_allowed_when_disabled():
    with patch(
        "app.services.copilot_quota.get_effective_quota",
        return_value=OrganizationCopilotQuota(
            organization_id="org-1",
            enabled=False,
            monthly_request_limit=100,
        ),
    ):
        with pytest.raises(HTTPException) as exc:
            copilot_quota.assert_copilot_allowed("org-1", "user-1")
    assert exc.value.status_code == 403


def test_assert_copilot_allowed_monthly_limit():
    quota = OrganizationCopilotQuota(
        organization_id="org-1",
        enabled=True,
        monthly_request_limit=10,
    )
    usage = OrganizationCopilotUsage(
        organization_id="org-1",
        period=copilot_quota.current_period(),
        request_count=10,
        estimated_cost_usd=0.0,
    )
    with patch("app.services.copilot_quota.get_effective_quota", return_value=quota):
        with patch("app.services.copilot_quota.get_usage_summary", return_value=usage):
            with pytest.raises(HTTPException) as exc:
                copilot_quota.assert_copilot_allowed("org-1", "user-1")
    assert exc.value.status_code == 429


def test_update_quota_clamps_to_platform_max(monkeypatch: pytest.MonkeyPatch):
    monkeypatch.setattr(settings, "copilot_platform_max_monthly_request_limit", 500)
    monkeypatch.setattr(settings, "copilot_platform_max_monthly_cost_cap_usd", 100.0)
    current = OrganizationCopilotQuota(
        organization_id="org-1",
        enabled=True,
        monthly_request_limit=200,
        monthly_cost_cap_usd=25.0,
    )
    with patch("app.services.copilot_quota.get_effective_quota", return_value=current):
        with patch("app.services.copilot_quota.store.upsert_copilot_quota") as upsert:
            with patch("app.services.copilot_quota.get_controls") as get_controls:
                get_controls.return_value = MagicMock()
                copilot_quota.update_quota(
                    "org-1",
                    OrganizationCopilotQuotaUpdate(monthly_request_limit=99999, monthly_cost_cap_usd=9999),
                )
    saved = upsert.call_args.args[0]
    assert saved.monthly_request_limit == 500
    assert saved.monthly_cost_cap_usd == 100.0


def test_record_copilot_usage_increments_store(_mock_store: MagicMock):
    copilot_quota.record_copilot_usage("org-1", "user-1", copilot_quota.CopilotOperation.policy_recommendation)
    _mock_store.increment_copilot_usage.assert_called_once()
