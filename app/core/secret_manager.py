# Loads production secrets from GCP Secret Manager into the process environment
# before app.core.config.Settings() reads them. No-op unless SECRETS_BACKEND is set,
# so local dev and tests (which rely on .env / plain env vars) are unaffected.
#
# Not to be confused with app/core/secrets.py, which encrypts integration tokens
# (GitHub/Slack/Figma) at rest in Firestore — a separate concern.

from __future__ import annotations

import os

# Secret Manager secret IDs follow: trustfabric-{env}-{var-name-with-dashes}
# e.g. ENCRYPTION_KEY in the "production" env -> trustfabric-production-encryption-key
_SECRET_ENV_VARS = [
    "ADMIN_TOKEN",
    "VIEWER_TOKEN",
    "OAUTH_STATE_SECRET",
    "ENCRYPTION_KEY",
    "CLAUDE_API_KEY",
    "OPENAI_API_KEY",
    "GEMINI_API_KEY",
    "VISION_API_KEY",
    "GITHUB_CLIENT_SECRET",
    "SLACK_CLIENT_SECRET",
    "AWS_ACCESS_KEY_ID",
    "AWS_SECRET_ACCESS_KEY",
]


def load_secrets_into_env() -> None:
    """Fetch secret values from GCP Secret Manager and inject them into os.environ.

    Gated by SECRETS_BACKEND=gcp-secret-manager so this is a no-op everywhere else
    (local dev, CI, tests). Values already present in the environment are never
    overwritten, so a platform-injected secret (e.g. a Cloud Run env var) always wins.
    """
    backend = os.environ.get("SECRETS_BACKEND", "").strip().lower()
    if backend != "gcp-secret-manager":
        return

    project_id = os.environ.get("GCP_PROJECT_ID") or os.environ.get("FIREBASE_PROJECT_ID")
    if not project_id:
        raise RuntimeError(
            "GCP_PROJECT_ID (or FIREBASE_PROJECT_ID) must be set when "
            "SECRETS_BACKEND=gcp-secret-manager"
        )

    try:
        from google.cloud import secretmanager
    except ImportError as exc:
        raise RuntimeError(
            "google-cloud-secret-manager is not installed. Add it to requirements.txt "
            "or unset SECRETS_BACKEND to fall back to plain environment variables."
        ) from exc

    env_prefix = os.environ.get("SECRETS_ENV_PREFIX") or os.environ.get("APP_ENV", "production")
    client = secretmanager.SecretManagerServiceClient()

    for env_var in _SECRET_ENV_VARS:
        if os.environ.get(env_var):
            continue

        secret_id = f"trustfabric-{env_prefix}-{env_var.lower().replace('_', '-')}"
        version_name = f"projects/{project_id}/secrets/{secret_id}/versions/latest"
        try:
            response = client.access_secret_version(name=version_name)
        except Exception:
            # Secret not created for this env (e.g. optional provider keys). Settings'
            # own production validation will raise on anything actually required.
            continue

        os.environ[env_var] = response.payload.data.decode("utf-8").strip()
