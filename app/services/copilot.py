from __future__ import annotations

from collections.abc import Callable

from fastapi import HTTPException, status

from app.core.config import settings
from app.services.copilot_quota import (
    CopilotOperation,
    assert_copilot_allowed,
    record_copilot_usage,
)
from app.services.claude import (
    generate_policy_recommendation as generate_policy_with_claude,
    generate_recommendations_for_system as generate_with_claude,
)
from app.services.gemini import (
    generate_policy_recommendation as generate_policy_with_gemini,
    generate_recommendations_for_system as generate_with_gemini,
)
from app.services.llm_resilience import provider_circuit
from app.services.openai_provider import (
    generate_policy_recommendation as generate_policy_with_openai,
    generate_recommendations_for_system as generate_with_openai,
)


ProviderFn = Callable[[int, str], dict]
PolicyProviderFn = Callable[[str, str, list[str] | None], dict]


def _provider_order() -> list[str]:
    provider = settings.copilot_provider.lower().strip()
    if provider == "openai":
        return ["openai"]
    if provider == "gemini":
        return ["gemini"]
    if provider == "claude":
        return ["claude"]
    if provider == "auto":
        # Prefer OpenAI-compatible first, then Gemini, then Claude.
        return ["openai", "gemini", "claude"]
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail="Invalid COPILOT_PROVIDER setting. Use auto, openai, gemini, or claude.",
    )


def _provider_fn(name: str) -> ProviderFn:
    if name == "openai":
        return generate_with_openai
    if name == "gemini":
        return generate_with_gemini
    if name == "claude":
        return generate_with_claude
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Unsupported copilot provider: {name}",
    )


def _policy_provider_fn(name: str) -> PolicyProviderFn:
    if name == "openai":
        return generate_policy_with_openai
    if name == "gemini":
        return generate_policy_with_gemini
    if name == "claude":
        return generate_policy_with_claude
    raise HTTPException(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        detail=f"Unsupported copilot provider: {name}",
    )


def generate_recommendations_for_system(system_id: int, user_id: str, organization_id: str) -> dict:
    assert_copilot_allowed(organization_id, user_id)
    errors: list[str] = []

    for provider in _provider_order():
        if provider_circuit.is_open(provider):
            errors.append(f"{provider}: circuit open")
            continue
        try:
            result = _provider_fn(provider)(
                system_id=system_id,
                user_id=user_id,
                organization_id=organization_id,
            )
            if "provider" not in result:
                result["provider"] = provider
            record_copilot_usage(
                organization_id,
                user_id,
                CopilotOperation.system_recommendation,
                provider=str(result.get("provider")),
                model=str(result.get("model")) if result.get("model") else None,
            )
            return result
        except HTTPException as exc:
            # Preserve not found from underlying service immediately.
            if exc.status_code == status.HTTP_404_NOT_FOUND:
                raise
            # Try fallback provider for upstream/unconfigured provider failures.
            if exc.status_code in (
                status.HTTP_502_BAD_GATEWAY,
                status.HTTP_503_SERVICE_UNAVAILABLE,
            ):
                errors.append(f"{provider}: {exc.detail}")
                continue
            raise

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"No copilot provider available ({'; '.join(errors)})",
    )


def generate_policy_recommendation(
    prompt: str,
    user_id: str,
    history: list[str] | None = None,
    organization_id: str | None = None,
) -> dict:
    org_id = organization_id or settings.default_organization_id
    assert_copilot_allowed(org_id, user_id)
    errors: list[str] = []

    for provider in _provider_order():
        if provider_circuit.is_open(provider):
            errors.append(f"{provider}: circuit open")
            continue
        try:
            result = _policy_provider_fn(provider)(
                prompt=prompt,
                user_id=user_id,
                history=history,
                organization_id=organization_id,
            )
            if "provider" not in result:
                result["provider"] = provider
            record_copilot_usage(
                org_id,
                user_id,
                CopilotOperation.policy_recommendation,
                provider=str(result.get("provider")) if result.get("provider") else None,
                model=str(result.get("model")) if result.get("model") else None,
            )
            return result
        except HTTPException as exc:
            if exc.status_code in (
                status.HTTP_502_BAD_GATEWAY,
                status.HTTP_503_SERVICE_UNAVAILABLE,
            ):
                errors.append(f"{provider}: {exc.detail}")
                continue
            raise

    raise HTTPException(
        status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
        detail=f"No copilot provider available ({'; '.join(errors)})",
    )
