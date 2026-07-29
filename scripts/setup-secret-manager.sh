#!/usr/bin/env bash
# Create/update GCP Secret Manager secrets for one TrustFabric environment
# (staging or production) from a local env file, and grant a runtime service
# account access to read them. Never commit the source env file.
#
# Usage:
#   ./scripts/setup-secret-manager.sh <env> <path-to-env-file> <runtime-service-account-email>
#
# Example:
#   ./scripts/setup-secret-manager.sh production .env.production \
#     trustfabric-api@my-gcp-project.iam.gserviceaccount.com
#
# Requires: gcloud CLI, authenticated (`gcloud auth login`) against the target
# GCP project (`gcloud config set project <id>`, or pass --project below).
#
# What this does, per KEY=value line in the env file:
#   1. Creates the secret trustfabric-<env>-<key-lower-dashed> if it doesn't exist.
#   2. Adds a new secret version with the current value.
#   3. Grants roles/secretmanager.secretAccessor to the runtime service account.
#
# See docs/secrets-management.md for the full setup guide.

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

ENV_NAME="${1:-}"
ENV_FILE="${2:-}"
RUNTIME_SA="${3:-}"

if [[ -z "$ENV_NAME" || -z "$ENV_FILE" || -z "$RUNTIME_SA" ]]; then
  echo "Usage: $0 <env> <path-to-env-file> <runtime-service-account-email>" >&2
  exit 1
fi

if [[ ! "$ENV_NAME" =~ ^[a-z0-9-]+$ ]]; then
  echo "Error: <env> must be lowercase alphanumeric/dashes (e.g. staging, production)" >&2
  exit 1
fi

if [[ ! -f "$ENV_FILE" ]]; then
  echo "Error: env file not found: $ENV_FILE" >&2
  exit 1
fi

# These are the only vars this script manages as secrets — everything else in the
# env file (URLs, feature flags, non-sensitive IDs) should stay as plain Cloud Run /
# Vercel env vars, not Secret Manager entries. Keep this list in sync with
# app/core/secret_manager.py's _SECRET_ENV_VARS.
SECRET_VARS=(
  ADMIN_TOKEN
  VIEWER_TOKEN
  OAUTH_STATE_SECRET
  ENCRYPTION_KEY
  CLAUDE_API_KEY
  OPENAI_API_KEY
  GEMINI_API_KEY
  VISION_API_KEY
  GITHUB_CLIENT_SECRET
  SLACK_CLIENT_SECRET
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
)

echo "Target env:      $ENV_NAME"
echo "Source file:      $ENV_FILE"
echo "Runtime SA:        $RUNTIME_SA"
echo "GCP project:        $(gcloud config get-value project 2>/dev/null)"
echo

for var in "${SECRET_VARS[@]}"; do
  # Extract KEY=value from the env file (ignores comments/blank lines; supports
  # optionally-quoted values). Skip vars that aren't set in this env's file.
  raw_line="$(grep -E "^${var}=" "$ENV_FILE" | tail -n1 || true)"
  if [[ -z "$raw_line" ]]; then
    continue
  fi
  value="${raw_line#*=}"
  value="${value%\"}"
  value="${value#\"}"
  if [[ -z "$value" ]]; then
    continue
  fi

  secret_id="trustfabric-${ENV_NAME}-$(echo "$var" | tr '[:upper:]_' '[:lower:]-')"

  if gcloud secrets describe "$secret_id" >/dev/null 2>&1; then
    echo "Updating $secret_id ..."
    printf '%s' "$value" | gcloud secrets versions add "$secret_id" --data-file=-
  else
    echo "Creating $secret_id ..."
    printf '%s' "$value" | gcloud secrets create "$secret_id" \
      --replication-policy="automatic" \
      --data-file=-
  fi

  gcloud secrets add-iam-policy-binding "$secret_id" \
    --member="serviceAccount:${RUNTIME_SA}" \
    --role="roles/secretmanager.secretAccessor" \
    --condition=None \
    >/dev/null
done

echo
echo "Done. Deploy the runtime with:"
echo "  SECRETS_BACKEND=gcp-secret-manager"
echo "  SECRETS_ENV_PREFIX=${ENV_NAME}"
echo "  GCP_PROJECT_ID=$(gcloud config get-value project 2>/dev/null)"
echo "as plain (non-secret) environment variables."
