# settings

from __future__ import annotations

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
    firebase_credentials_file: str | None = None

    claude_api_key: str = ""
    anthropic_model: str = "claude-3-5-sonnet-20241022"

    rate_limit_per_minute: int = 60

    # Policy engine
    policies_file: str | None = "policies.yaml"


settings = Settings()
