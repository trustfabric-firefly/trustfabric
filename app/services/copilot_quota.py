from __future__ import annotations

from datetime import datetime, timezone
from enum import Enum

from fastapi import HTTPException, status

from app.core.config import settings
from app.domain.models import (
    OrganizationCopilotControls,
    OrganizationCopilotQuota,
    OrganizationCopilotQuotaUpdate,
    OrganizationCopilotUsage,
)
from app.services.store import store


class CopilotOperation(str, Enum):
    system_recommendation = "system_recommendation"
    policy_recommendation = "policy_recommendation"
    explain_missing = "explain_missing"


_OPERATION_COST_MULTIPLIER = {
    CopilotOperation.system_recommendation: 1.0,
    CopilotOperation.policy_recommendation: 1.0,
    CopilotOperation.explain_missing: 0.8,
}


def current_period() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m")


def current_day() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%d")


def default_quota_for_organization(organization_id: str, plan: str | None = None) -> OrganizationCopilotQuota:
    monthly_limit = settings.copilot_default_monthly_request_limit
    if plan == "enterprise":
        monthly_limit = min(settings.copilot_platform_max_monthly_request_limit, monthly_limit * 5)
    return OrganizationCopilotQuota(
        organization_id=organization_id,
        enabled=True,
        monthly_request_limit=monthly_limit,
        monthly_cost_cap_usd=settings.copilot_default_monthly_cost_cap_usd,
        daily_request_limit_per_user=settings.copilot_default_daily_request_limit_per_user,
    )


def get_effective_quota(organization_id: str) -> OrganizationCopilotQuota:
    stored = store.get_copilot_quota(organization_id)
    if stored is not None:
        return stored
    org = store.get_organization(organization_id)
    plan = org.plan if org else "trial"
    return default_quota_for_organization(organization_id, plan)


def get_usage_summary(organization_id: str) -> OrganizationCopilotUsage:
    return store.get_copilot_usage(organization_id, current_period())


def get_controls(organization_id: str) -> OrganizationCopilotControls:
    return OrganizationCopilotControls(
        quota=get_effective_quota(organization_id),
        usage=get_usage_summary(organization_id),
        platform_max_monthly_request_limit=settings.copilot_platform_max_monthly_request_limit,
        platform_max_monthly_cost_cap_usd=settings.copilot_platform_max_monthly_cost_cap_usd,
        estimated_cost_per_request_usd=settings.copilot_estimated_cost_per_request_usd,
    )


def _clamp_quota_update(
    current: OrganizationCopilotQuota,
    payload: OrganizationCopilotQuotaUpdate,
) -> OrganizationCopilotQuota:
    enabled = current.enabled if payload.enabled is None else payload.enabled

    monthly_limit = current.monthly_request_limit
    if payload.monthly_request_limit is not None:
        monthly_limit = payload.monthly_request_limit
    if monthly_limit > settings.copilot_platform_max_monthly_request_limit:
        monthly_limit = settings.copilot_platform_max_monthly_request_limit

    monthly_cost_cap = current.monthly_cost_cap_usd
    if payload.monthly_cost_cap_usd is not None:
        monthly_cost_cap = payload.monthly_cost_cap_usd or None
    if monthly_cost_cap is not None and monthly_cost_cap > settings.copilot_platform_max_monthly_cost_cap_usd:
        monthly_cost_cap = settings.copilot_platform_max_monthly_cost_cap_usd

    daily_limit = current.daily_request_limit_per_user
    if payload.daily_request_limit_per_user is not None:
        daily_limit = payload.daily_request_limit_per_user or None

    return OrganizationCopilotQuota(
        organization_id=current.organization_id,
        enabled=enabled,
        monthly_request_limit=monthly_limit,
        monthly_cost_cap_usd=monthly_cost_cap,
        daily_request_limit_per_user=daily_limit,
        updated_at=datetime.now(timezone.utc),
    )


def update_quota(organization_id: str, payload: OrganizationCopilotQuotaUpdate) -> OrganizationCopilotControls:
    current = get_effective_quota(organization_id)
    updated = _clamp_quota_update(current, payload)
    store.upsert_copilot_quota(updated)
    return get_controls(organization_id)


def initialize_quota_for_organization(organization_id: str, plan: str = "trial") -> OrganizationCopilotQuota:
    quota = default_quota_for_organization(organization_id, plan)
    quota.updated_at = datetime.now(timezone.utc)
    return store.upsert_copilot_quota(quota)


def assert_copilot_allowed(organization_id: str, user_id: str) -> None:
    quota = get_effective_quota(organization_id)
    if not quota.enabled:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Copilot is disabled for this organization",
        )

    usage = get_usage_summary(organization_id)
    if quota.monthly_request_limit > 0 and usage.request_count >= quota.monthly_request_limit:
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Monthly copilot request limit reached ({quota.monthly_request_limit} requests). "
                "Contact your organization admin to adjust quotas."
            ),
            headers={"Retry-After": "3600"},
        )

    if (
        quota.monthly_cost_cap_usd is not None
        and usage.estimated_cost_usd >= quota.monthly_cost_cap_usd
    ):
        raise HTTPException(
            status_code=status.HTTP_429_TOO_MANY_REQUESTS,
            detail=(
                f"Monthly copilot cost cap reached (${quota.monthly_cost_cap_usd:.2f}). "
                "Contact your organization admin to adjust quotas."
            ),
            headers={"Retry-After": "3600"},
        )

    if quota.daily_request_limit_per_user:
        user_daily = store.get_user_daily_copilot_requests(organization_id, user_id, current_day())
        if user_daily >= quota.daily_request_limit_per_user:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=(
                    f"Daily copilot limit reached for your user ({quota.daily_request_limit_per_user} requests). "
                    "Try again tomorrow or contact your organization admin."
                ),
                headers={"Retry-After": "86400"},
            )


def record_copilot_usage(
    organization_id: str,
    user_id: str,
    operation: CopilotOperation,
    *,
    provider: str | None = None,
    model: str | None = None,
) -> None:
    del provider, model  # reserved for future per-model costing
    multiplier = _OPERATION_COST_MULTIPLIER.get(operation, 1.0)
    cost = settings.copilot_estimated_cost_per_request_usd * multiplier
    store.increment_copilot_usage(
        organization_id,
        current_period(),
        user_id=user_id,
        day=current_day(),
        cost_usd=cost,
    )
