# settings

from __future__ import annotations

from typing import Annotated

from pydantic import AliasChoices, Field, field_validator, model_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TrustFabric"
    app_env: str = "dev"
    app_version: str = "0.0.1"

    admin_token: str = ""
    viewer_token: str = ""
    default_organization_id: str = "default"
    oauth_state_secret: str = ""
    encryption_key: str = ""

    database_url: str = ""  # DB connection

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
    rate_limit_expensive_per_minute: int = 10
    rate_limit_auth_per_minute: int = 20
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:3000",
            "http://127.0.0.1:3000",
            "http://localhost:5173",
        ]
    )

    @field_validator("cors_origins", mode="before")
    @classmethod
    def parse_cors_origins(cls, value: str | list[str]) -> list[str]:
        if isinstance(value, str):
            return [origin.strip() for origin in value.split(",") if origin.strip()]
        return value

    # Policy engine
    policies_file: str | None = "policies.yaml"

    # GitHub OAuth
    github_client_id: str = ""
    github_client_secret: str = ""
    github_redirect_uri: str = ""
    frontend_url: str = "http://localhost:3000"
    api_base_url: str = "http://localhost:8000"

    # Slack OAuth
    slack_client_id: str = ""
    slack_client_secret: str = ""
    slack_redirect_uri: str = ""

    # AWS
    aws_external_id: str = ""  # shared external ID for STS AssumeRole (set per deployment)
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    aws_default_region: str = "us-east-1"

    @model_validator(mode="after")
    def derive_integration_urls(self) -> "Settings":
        """Default OAuth callback URLs from API_BASE_URL when not explicitly set."""
        base = (self.api_base_url or "http://localhost:8000").rstrip("/")
        if not self.github_redirect_uri:
            self.github_redirect_uri = f"{base}/api/v1/integrations/github/callback"
        if not self.slack_redirect_uri:
            self.slack_redirect_uri = f"{base}/api/v1/integrations/slack/callback"
        return self

    @property
    def github_oauth_ready(self) -> bool:
        return bool(self.github_client_id and self.github_client_secret)

    @property
    def slack_oauth_ready(self) -> bool:
        return bool(self.slack_client_id and self.slack_client_secret)

    @model_validator(mode="after")
    def check_production_secrets(self) -> "Settings":
        if self.app_env == "production":
            required = {
                "admin_token": self.admin_token,
                "viewer_token": self.viewer_token,
                "encryption_key": self.encryption_key,
                "oauth_state_secret": self.oauth_state_secret,
                "firebase_project_id": self.firebase_project_id,
                "database_url": self.database_url,
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                raise ValueError(f"Missing required secrets for production: {missing}")

            if "*" in self.cors_origins:
                raise ValueError("Wildcard CORS origin is not allowed in production")

            if self.admin_token or self.viewer_token:
                raise ValueError("ADMIN_TOKEN and VIEWER_TOKEN must not be set in production")

        return self


settings = Settings()
