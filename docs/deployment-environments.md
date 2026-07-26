# Staging & production environments

TrustFabric currently runs from a single `.env` / one Firebase project per deployer. This doc defines how to split that into an isolated **staging** and **production** environment — separate data, separate secrets, separate everything a bug or bad deploy could otherwise leak across.

## Principle: no shared state between environments

| Resource | Staging | Production |
|---|---|---|
| Firebase project (Firestore + Auth) | `trustfabric-staging` | `trustfabric-prod` |
| GCP project (can be the same as Firebase project) | same as above | same as above |
| Secret Manager secrets | `trustfabric-staging-*` (see [secrets-management.md](secrets-management.md)) | `trustfabric-production-*` |
| Backend deploy | separate Cloud Run service / Compose stack | separate Cloud Run service / Compose stack |
| Frontend deploy | separate Vercel project or environment | separate Vercel project or environment |
| `API_BASE_URL` / `FRONTEND_URL` | `https://api-staging.yourdomain.com` / `https://staging.yourdomain.com` | `https://api.yourdomain.com` / `https://app.yourdomain.com` |
| GitHub/Slack OAuth apps | separate OAuth app **or** one app with both callback URLs registered | see left |
| `ADMIN_TOKEN` / `VIEWER_TOKEN` | unset (only allowed outside `APP_ENV=production`; still don't reuse across environments if you ever set them for a staging smoke test) | must be empty — enforced by `Settings.check_production_secrets()` |

Two separate **Firebase projects** is the load-bearing decision: it guarantees a staging bug can never write to production Firestore data or send a production user a staging-signed auth token, without relying on any application-level check.

## Environment variable differences

Everything in `.env.example` applies to both environments; the values below are the ones that **must** differ. Keep a local `.env.staging` / `.env.production` file per environment (gitignored — see `.gitignore`'s `.env.*` pattern) as the source of truth you feed into `scripts/setup-secret-manager.sh` and your deploy platform's plain env var config.

```bash
# .env.staging (example — real values live only in your deploy platform / Secret Manager)
APP_ENV=production            # staging still runs the "production" code path (no dev tokens);
                               # it is a deployed environment, not local dev
FIREBASE_PROJECT_ID=trustfabric-staging
API_BASE_URL=https://api-staging.yourdomain.com
FRONTEND_URL=https://staging.yourdomain.com
CORS_ORIGINS=https://staging.yourdomain.com
SECRETS_BACKEND=gcp-secret-manager
GCP_PROJECT_ID=trustfabric-staging
SECRETS_ENV_PREFIX=staging
```

```bash
# .env.production
APP_ENV=production
FIREBASE_PROJECT_ID=trustfabric-prod
API_BASE_URL=https://api.yourdomain.com
FRONTEND_URL=https://app.yourdomain.com
CORS_ORIGINS=https://app.yourdomain.com
SECRETS_BACKEND=gcp-secret-manager
GCP_PROJECT_ID=trustfabric-prod
SECRETS_ENV_PREFIX=production
```

Frontend (`frontend/.env.local.example` vars, set as build/deploy-time env on Vercel per environment):

```bash
NEXT_PUBLIC_API_BASE_URL=https://api-staging.yourdomain.com   # or api.yourdomain.com
NEXT_PUBLIC_FIREBASE_*=...                                    # staging Firebase web app config vs prod
```

`NEXT_PUBLIC_*` vars are compiled into the client bundle — never put a secret in one, and double check the staging bundle points at the staging Firebase project (not prod) before it ships.

## One-time setup, per environment

1. **Create the Firebase project** ([console.firebase.google.com](https://console.firebase.google.com)) and enable Firestore + Authentication (same providers as prod: email/password, and SAML via Firebase custom tokens per [sso-saml-setup.md](sso-saml-setup.md)).
2. **Download a service account key** for that project (used once, locally, to bootstrap — the running service should use Workload Identity / the runtime service account, not a downloaded key, per [secrets-management.md](secrets-management.md)).
3. **Deploy Firestore rules and indexes** to that project:
   ```bash
   FIREBASE_PROJECT_ID=trustfabric-staging ./scripts/deploy-firestore-rules.sh
   ```
4. **Provision secrets:**
   ```bash
   ./scripts/setup-secret-manager.sh staging .env.staging \
     trustfabric-api@trustfabric-staging.iam.gserviceaccount.com
   ```
5. **Deploy the backend** with the plain env vars from the table above (Cloud Run: `--set-env-vars`, or Compose: a per-environment `docker-compose.staging.yml` env file) and `--service-account trustfabric-api@...`.
6. **Deploy the frontend** as its own Vercel environment (or project) with the matching `NEXT_PUBLIC_*` vars.
7. **Register OAuth callback URLs** for that environment's `API_BASE_URL` with GitHub/Slack (see root README §6/§7).
8. **Smoke test:** sign in, create a system, run a scan, confirm the browser network tab is calling the environment's own `API_BASE_URL` and no cross-environment requests occur.

## Promotion flow

Recommended: `main` branch auto-deploys to **staging**; a tagged release or manual approval promotes the same build artifact to **production**. This repo's CI (`.github/workflows/docker-image.yml`) currently only builds the image — wiring it to push to a registry and deploy per-branch is a separate, larger piece of work (tracked as "extend docker-image.yml to push images to a registry and deploy to staging/prod"); this doc defines the target env separation that work should deploy into, not the pipeline itself.

## What this doesn't cover yet

- Automated CI/CD promotion (see above).
- Database/collection migration tooling between environments (Firestore schema versioning is a separate open item).
- Cost: running two full environments roughly doubles Firebase/Cloud Run spend at low volume — acceptable for a pre-GA product, worth revisiting with usage-based scaling once there's real staging traffic.
