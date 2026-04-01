from __future__ import annotations

from collections.abc import Callable

from fastapi import HTTPException, status

from app.core.config import settings
from app.services.claude import generate_recommendations_for_system as generate_with_claude
from app.services.gemini import generate_recommendations_for_system as generate_with_gemini
from app.services.openai_provider import generate_recommendations_for_system as generate_with_openai


ProviderFn = Callable[[int, str], dict]


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


def generate_recommendations_for_system(system_id: int, user_id: str) -> dict:
    errors: list[str] = []

    for provider in _provider_order():
        try:
            result = _provider_fn(provider)(system_id=system_id, user_id=user_id)
            if "provider" not in result:
                result["provider"] = provider
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
