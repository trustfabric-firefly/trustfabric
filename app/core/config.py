# settings

from __future__ import annotations

from pydantic import AliasChoices, Field, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    app_name: str = "TrustFabric"
    app_env: str = "dev"
    app_version: str = "0.0.1"

    admin_token: str = ""
    viewer_token: str = ""

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
    gemini_api_key: str = ""
    gemini_model: str = "gemini-2.5-flash"
    copilot_provider: str = "auto"  # auto | gemini | claude

    rate_limit_per_minute: int = 60
    cors_origins: list[str] = [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
    ]

    # Policy engine
    policies_file: str | None = "policies.yaml"

    @model_validator(mode="after")
    def check_production_secrets(self) -> "Settings":
        if self.app_env == "production":
            required = {
                "admin_token": self.admin_token,
                "viewer_token": self.viewer_token,
                "database_url": self.database_url,
            }
            missing = [k for k, v in required.items() if not v]
            if missing:
                raise ValueError(f"Missing required secrets for production: {missing}")

            if "*" in self.cors_origins:
                raise ValueError("Wildcard CORS origin is not allowed in production")

        return self


settings = Settings()
