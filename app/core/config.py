# settings

from __future__ import annotations

from pydantic import AliasChoices, Field
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TrustFabric"
    app_env: str = "dev"
    app_version: str = "0.0.1"

    admin_token: str = "admin-dev-token"
    viewer_token: str = "viewer-dev-token"

    database_url: str = "" # DB connection 

    # Firebase
    firebase_project_id: str = ""
    firebase_credentials_file: str | None = Field(
        default=None,
        # allow both environment variables to be used. if one is not set, the other will be used.
        validation_alias=AliasChoices("FIREBASE_CREDENTIALS_FILE", "SERVICE_FIREBASE"),
    )

    claude_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-20241022"
    openai_api_key: str = ""
    openai_base_url: str = ""
    openai_model: str = "z-ai/glm4.7"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    copilot_provider: str = "auto"  # auto | openai | gemini | claude

    # Vision API (brand compliance scanner) — defaults to openai settings if not set
    vision_api_key: str = ""
    vision_base_url: str = ""
    vision_model: str = "meta/llama-4-maverick-17b-128e-instruct"

    rate_limit_per_minute: int = 60
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]

    # Policy engine
    policies_file: str | None = "policies.yaml"

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = "http://localhost:8000/api/v1/integrations/github/callback"
    frontend_url: str = "http://localhost:3000"

    # Figma Integration
    figma_token: str = ""


settings = Settings()
