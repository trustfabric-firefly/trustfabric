# Architecture

## High-level diagram

```text
┌──────────────────┐      HTTPS       ┌────────────────────┐
│   Next.js (UI)    │ ───────────────►│    FastAPI (API)    │
│   frontend/        │  Bearer JWT /   │    app/              │
└─────────┬──────────┘   dev token     └─────────┬────────────┘
          │                                       │
          │ Firebase Auth                         ├──► Firestore (systems, events, orgs, …)
          │ (ID tokens, SAML custom tokens)        ├──► Anthropic (Claude)
          │                                        ├──► Google AI (Gemini) / OpenAI-compatible
          └────────────────────────────────────────┤
                                                    ├──► GitHub / Slack / AWS / Figma APIs
                                                    │      (customer-connected integrations)
                                                    └──► Customer webhook endpoints
                                                           (scan completion, compliance alerts)
```

An IdP (Okta, Entra ID, Google Workspace, …) can sit in front of Firebase Auth per organization via SAML — see [sso-saml-setup.md](sso-saml-setup.md).

## Backend (`app/`)

| Layer | Location | Role |
|-------|----------|------|
| **App factory** | `app/main.py` | Creates the FastAPI app, wires CORS/security headers, mounts `api_router`. |
| **Routers** | `app/api/routes/*.py` | One file per domain — see [API surface](#api-surface) below. Mounted in `app/api/router.py`. |
| **Config** | `app/core/config.py` | Single `Settings` (pydantic-settings) instance, read once at import. Validates required production secrets and rejects wildcard CORS / dev tokens when `APP_ENV=production`. |
| **Secret loading** | `app/core/secret_manager.py` | Populates `os.environ` from GCP Secret Manager before `Settings()` reads it, when `SECRETS_BACKEND=gcp-secret-manager`. See [secrets-management.md](secrets-management.md). |
| **Security / RBAC** | `app/core/security.py` | `get_actor` resolves a request's `Actor` (user, org, role) from a dev token or Firebase ID token. `require_admin` / `require_operator` gate write and operator-tier routes. |
| **Rate limiting** | `app/core/rate_limit.py` | Token-bucket limiter with separate tiers (`default`, `expensive`, `auth`) applied via FastAPI dependencies on scan/copilot/auth routes. |
| **SSO state** | `app/core/sso_state.py` | Signs/verifies the SAML `RelayState` (org id + post-login redirect) so it can't be tampered with in transit. |
| **Domain models** | `app/domain/models.py` | Pydantic models shared across API, services, and store — the source of truth for request/response shapes and (indirectly) Firestore document shapes. |
| **Persistence** | `app/services/store.py` (`FirestoreStore`) | All Firestore reads/writes. Lazily initializes the Firestore client on first use, so importing the app doesn't require credentials (important for tests). See [data-and-storage.md](data-and-storage.md) for the full schema. |
| **Organizations & membership** | `app/services/organizations.py`, `app/services/members.py` | Org CRUD, invites, role resolution for both dev tokens and Firebase actors. |
| **SSO** | `app/services/sso.py` | SAML request/response handling (`python3-saml`), JIT provisioning, one-time code exchange. |
| **Policy engine** | `app/services/policies.py`, `app/services/policy_eval.py` + `policies.yaml` | Required governance policies per risk tier; evaluates scan results against policy/framework requirements. |
| **Frameworks** | `app/services/frameworks.py` | NIST AI RMF / SOC 2 / EU AI Act coverage scoring from policy + scan state. |
| **Copilot routing** | `app/services/copilot.py`, `copilot_quota.py`, `copilot_disclaimer.py`, `llm_resilience.py` | Chooses OpenAI-compatible / Gemini / Claude per `COPILOT_PROVIDER`, enforces per-org quotas and cost caps, retries/circuit-breaks upstream failures, and ensures advisory disclaimers are attached to responses. |
| **LLM integrations** | `app/services/claude.py`, `gemini.py`, `openai_provider.py` | Claude: system recs + policy JSON generation. Gemini/OpenAI-compatible: system recs. |
| **Scanning** | `app/services/scan.py` (GitHub), `app/services/aws_scan.py` (AWS), `app/services/brand_compliance.py` (Figma/vision) | Executes compliance checks against connected integrations, scoped by `app/services/job_queue.py` so long scans don't block request handlers. |
| **Webhooks** | `app/services/webhooks.py` | HMAC-signed delivery of `scan.completed`, `scan.failed`, `compliance.alert`, `audit.created` events to customer-registered endpoints. |
| **Integration credentials** | `app/integrations/github.py`, `slack.py`, `aws.py`, `app/core/secrets.py` | OAuth flows for GitHub/Slack, AWS STS AssumeRole, and Fernet encryption of stored tokens (distinct from `app/core/secret_manager.py`, which handles the app's own production secrets, not customer-connected credentials). |
| **Firebase Admin** | `app/integrations/firebase.py` | Verifies Firebase ID tokens, issues custom tokens for SSO exchange, `check_revoked` enforcement. |
| **Report generation** | `app/services/scan_report_pdf.py` | True PDF export for scan reports (`fpdf2`). |

### API surface

All routes are mounted under `/api/v1` by `app/api/router.py`:

| Prefix | Router file | Covers |
|---|---|---|
| `/health` | `health.py` | Health check |
| `/api/v1/auth/sso` | `sso.py` | SAML discover/login/ACS/metadata/exchange |
| `/api/v1/organizations` | `organizations.py` | Org CRUD, members, invites, SSO config, copilot quotas |
| `/api/v1/systems` | `systems.py` | AI system inventory CRUD, CSV import, governance policies, copilot chat |
| `/api/v1/events` | `events.py` | Activity events |
| `/api/v1/dashboard` | `dashboard.py` | Aggregated dashboard summary |
| `/api/v1/audit` | `audit.py` | Audit log (paginated) |
| `/api/v1/llm-logs` | `llm_logs.py` | LLM interaction log admin API |
| `/api/v1/copilot` | `copilot.py` | System recommendations, policy text generation |
| `/api/v1/integrations` | `integrations.py` | GitHub/Slack/AWS/Figma connect status and OAuth callbacks |
| `/api/v1/scans` | `scans.py` | GitHub compliance scan trigger/results |
| `/api/v1/scan-policies` | `scan_policies.py` | Which checks run in a scan |
| `/api/v1/settings` | `settings.py` | Org/user settings |
| `/api/v1` (compliance) | `compliance.py` | Framework coverage (NIST/SOC 2/EU AI Act) |
| `/api/v1/brand-compliance` | `brand_compliance.py` | Figma/vision-based brand compliance scanning |
| `/api/v1/figma` | `figma.py` | Figma OAuth/token connect |
| `/api/v1/webhooks` | `webhooks.py` | Customer webhook endpoint CRUD |

Interactive schema and try-it-out UI: run the backend and open `/docs` (Swagger UI).

### Authentication & request flow

1. Client sends `Authorization: Bearer <token>` (+ optional `X-Organization-Id` header).
2. `get_actor` (`app/core/security.py`) resolves it:
   - Outside production, a literal match against `ADMIN_TOKEN` / `VIEWER_TOKEN` short-circuits to a dev `Actor`.
   - Otherwise, if `FIREBASE_PROJECT_ID` is set, the token is verified as a Firebase ID token (`app/integrations/firebase.py`), and org/role are resolved from Firestore membership + claims.
   - In production with no Firebase project configured, auth fails closed.
3. Route dependencies (`require_admin`, `require_operator`, or none for read routes) authorize the resolved `Actor`.
4. Rate limiting (`app/core/rate_limit.py`) applies per-tier, keyed by actor/IP, before the handler runs.

### Background jobs

Long-running work (GitHub/AWS scans) is submitted to `app/services/job_queue.py` rather than blocking the request. Job state (`pending` → `running` → `completed`/`failed`) is persisted in Firestore (`jobs` collection) and polled by the frontend; concurrency is capped by `JOB_QUEUE_MAX_CONCURRENT`.

## Frontend (`frontend/`)

Next.js 16, App Router.

```
frontend/
├── app/
│   ├── page.tsx                     # Public marketing landing page
│   ├── (auth)/login/                # Login (Firebase, dev-token, or SSO discovery)
│   ├── (auth)/sso/callback/         # Exchanges a one-time SSO code for a session
│   └── (app)/                       # Authenticated app shell (requires AppAuthGate)
│       ├── layout.tsx               # Sidebar + top bar + auth gate
│       └── dashboard, systems, scans, audit, compliance, policies,
│           brand-compliance, settings /page.tsx
├── components/
│   ├── auth/AppAuthGate.tsx         # Client-side redirect to /login when unauthenticated
│   ├── layout/Sidebar.tsx, TopBar.tsx
│   ├── marketing/                   # Landing page sections (Hero, Security, Compliance, …)
│   ├── scans/                       # Integration hub, Figma brand-scan panel
│   └── ui/                          # Shared primitives (Badge, Modal, icons, theming)
├── providers/
│   ├── AuthProvider.tsx             # Firebase auth state + isDevMode flag
│   ├── OrganizationProvider.tsx     # Active organization context/switching
│   ├── QueryProvider.tsx            # TanStack Query client
│   └── ThemeProvider.tsx            # Light/dark theme
├── lib/
│   ├── api.ts                      # All backend fetch calls; resolves auth headers
│   ├── auth-*.ts                   # Auth cookie/session/middleware helpers
│   ├── firebase.ts                 # Firebase web SDK init
│   └── security-headers.ts         # CSP/HSTS header construction (used by middleware.ts)
├── middleware.ts                    # Server-side auth gate + security headers on every request
└── types/index.ts                   # Shared TypeScript types mirroring backend models
```

**Auth header resolution** (`frontend/lib/api.ts`), in order: Firebase `getIdToken()` when signed in → `localStorage` token → `NEXT_PUBLIC_DEV_ADMIN_TOKEN` (non-production only). `middleware.ts` additionally enforces server-side redirects for unauthenticated requests to `(app)` routes and attaches CSP/security headers to every response — see [security-overview.md](security-overview.md).

## Data & external services

- **Persistence:** Google Cloud Firestore — see [data-and-storage.md](data-and-storage.md) for the full collection schema.
- **LLM providers:** Anthropic Claude, Google Gemini, or any OpenAI-compatible endpoint, routed per `COPILOT_PROVIDER` — see [copilot-and-llm.md](copilot-and-llm.md).
- **Customer integrations:** GitHub (OAuth), Slack (OAuth), AWS (STS AssumeRole), Figma (personal access token) — each scoped per-organization, credentials encrypted at rest.
- **Secrets:** GCP Secret Manager in staging/production — see [secrets-management.md](secrets-management.md).

## Cross-origin requests & security headers

The API enables CORS via `CORSMiddleware` in `app/main.py`, with origins from `cors_origins` in `app/core/config.py` — wildcard origins are rejected when `APP_ENV=production`. The frontend applies a nonce-based Content-Security-Policy and HSTS via `middleware.ts` / `frontend/lib/security-headers.ts`.

## Environments

Local dev runs a single backend + frontend against one Firebase project. Staging and production are fully separate Firebase/GCP projects with independent secrets and deploy targets — see [deployment-environments.md](deployment-environments.md).
