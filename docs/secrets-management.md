# Secrets management (GCP Secret Manager)

## Why

Today, production secrets (`ADMIN_TOKEN`, `ENCRYPTION_KEY`, LLM API keys, OAuth client secrets, AWS keys, …) are supplied as plain environment variables — via `.env` locally, or via `env_file: .env` / CI secret injection in Docker. That's fine for a single dev machine, but for staging/production it means:

- Secrets sit in plaintext in whatever platform holds the env vars (Cloud Run config, CI secrets, deploy scripts), with no per-secret access control or audit log.
- Rotating a secret means re-deploying with a new env var everywhere it's set, with no version history.
- There's no single place to see what a given environment's secrets *are* (names, not values) without reading multiple deploy configs.

**GCP Secret Manager** fixes this: secrets are versioned, access is IAM-scoped per secret, and every read is audit-logged. This doc covers the loader already wired into the backend and how to provision the secrets themselves.

## How it works

`app/core/secret_manager.py` exposes `load_secrets_into_env()`, called once at import time from `app/core/config.py`, **before** `Settings()` reads `os.environ`. It is a no-op unless `SECRETS_BACKEND=gcp-secret-manager` is set, so local dev, CI, and tests are unaffected and keep using `.env` / plain env vars exactly as before.

When enabled, for each secret-shaped setting (see `_SECRET_ENV_VARS` in that file — tokens, encryption keys, LLM/API keys, OAuth client secrets, AWS keys), it:

1. Skips the var if it's already set in the environment. **An explicit env var always wins** — this lets a platform (e.g. Cloud Run's own env var UI) override a value without touching Secret Manager, and keeps the code path safe if Secret Manager is briefly unavailable and the platform has a fallback set.
2. Otherwise looks up `projects/<GCP_PROJECT_ID>/secrets/trustfabric-<env>-<var-name-with-dashes>/versions/latest` (e.g. `ENCRYPTION_KEY` in `production` → `trustfabric-production-encryption-key`) and, if it exists, writes the value into `os.environ`.
3. Silently skips secrets that don't exist for that environment (e.g. optional provider keys) — `Settings.check_production_secrets()` already raises a clear error if something *required* is still missing after this runs.

`<env>` is `SECRETS_ENV_PREFIX` if set, else `APP_ENV` (so `production` and `staging` naturally get separate secrets — see [deployment-environments.md](deployment-environments.md)).

### What is/isn't a secret

Only credential-shaped values go through Secret Manager. Everything else in `.env.example` (`CORS_ORIGINS`, `API_BASE_URL`, `FRONTEND_URL`, `FIREBASE_PROJECT_ID`, `GITHUB_CLIENT_ID`, rate limit numbers, model names, …) stays as a plain, non-secret environment variable on the deploy platform — it's config, not a credential, and hiding it in Secret Manager would just add IAM friction with no security benefit.

## Setup

**1. Enable the API and create a runtime service account** (once per GCP project):

```bash
gcloud services enable secretmanager.googleapis.com

gcloud iam service-accounts create trustfabric-api \
  --display-name="TrustFabric API runtime"
```

Use this service account's identity for the deployed backend (Cloud Run's built-in Workload Identity, or a mounted key for other hosts) — never a downloaded JSON key committed anywhere.

**2. Create a local env file with real values for the target environment** (e.g. `.env.production` — copy `.env.example`, fill it in, and keep it out of git; it's already covered by `.gitignore`'s `.env` pattern... double check `.env.production` matches, see note below).

**3. Push secrets and grant access:**

```bash
./scripts/setup-secret-manager.sh production .env.production \
  trustfabric-api@<your-gcp-project-id>.iam.gserviceaccount.com
```

This creates (or adds a new version to) `trustfabric-production-<var>` for each secret-shaped var present in the file, and grants `roles/secretmanager.secretAccessor` on each to the runtime service account. Run it again any time a secret changes — it's idempotent, and safe to re-run.

Repeat for `staging` with a separate env file and (ideally) a separate GCP project — see [deployment-environments.md](deployment-environments.md).

**4. Configure the deploy target** with these **plain** (non-secret) env vars, plus everything else from `.env.example` that isn't secret-shaped:

```bash
SECRETS_BACKEND=gcp-secret-manager
GCP_PROJECT_ID=<your-gcp-project-id>
SECRETS_ENV_PREFIX=production   # or staging
```

On Cloud Run, run the service **as** the `trustfabric-api` service account (`--service-account` flag) so it can call Secret Manager without a key file.

## Rotation

Secrets are read once, at process startup (`load_secrets_into_env()` runs at import time). Rotating a value means:

```bash
echo -n "new-value" | gcloud secrets versions add trustfabric-production-encryption-key --data-file=-
```

then deploying a new revision (Cloud Run) or restarting the process — there's no live-reload. For `ENCRYPTION_KEY` specifically, coordinate with [`app/core/secrets.py`](../app/core/secrets.py) (integration-token encryption) — rotating it invalidates previously encrypted tokens unless you run a migration pass first (see `scripts/migrate_integration_secrets.py`).

## Local development

Don't set `SECRETS_BACKEND` locally. Keep using `.env` as documented in the root README — the loader is a complete no-op in that case.

## Firebase service account credentials

This loader handles **string env vars**, not the Firebase service account **JSON key file** (`SERVICE_FIREBASE` / `FIREBASE_CREDENTIALS_FILE`), which today is baked into the Docker image at build time (tracked separately — "Stop copying Firebase service account credentials into the Docker image at build time"). Once that moves to a runtime-loaded file, the natural extension is to store the JSON blob itself as a Secret Manager secret (`trustfabric-<env>-firebase-credentials`) and write it to a temp file on container start, using the same `gcloud secrets versions access` pattern used here. Not implemented yet — flagging so the two pieces of work compose cleanly instead of diverging.
