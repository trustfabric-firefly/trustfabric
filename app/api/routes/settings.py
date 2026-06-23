from __future__ import annotations

from fastapi import APIRouter, Depends

from app.core.config import settings
from app.core.security import Actor, get_actor

router = APIRouter()


@router.get("/status")
async def get_settings_status(actor: Actor = Depends(get_actor)):
    """Return non-sensitive configuration status for the settings UI."""
    return {
        "app_version": settings.app_version,
        "app_env": settings.app_env,
        "llm_provider": settings.copilot_provider,
        "llm_model": settings.anthropic_model,
        "openai_model": settings.openai_model,
        "gemini_model": settings.gemini_model,
        "openai_api_configured": bool(settings.openai_api_key),
        "claude_api_configured": bool(settings.claude_api_key),
        "gemini_api_configured": bool(settings.gemini_api_key),
        "firebase_configured": bool(settings.firebase_project_id),
        "github_oauth_configured": settings.github_oauth_ready,
        "slack_oauth_configured": settings.slack_oauth_ready,
        "aws_configured": bool(settings.aws_external_id),
        "rate_limit_per_minute": settings.rate_limit_per_minute,
        "rate_limit_expensive_per_minute": settings.rate_limit_expensive_per_minute,
        "rate_limit_auth_per_minute": settings.rate_limit_auth_per_minute,
    }
