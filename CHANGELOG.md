# Changelog

## 3. Functional Requirements Completeness (Registry, Events, Risk, Policies, Copilot)

Closed remaining gaps against the senior-design functional requirements (§3.1–3.5, §4.1).

### §3.4 Event Logging (Simulated)

- New **Activity Events** page (`/events`) with filters for system, event type, and date range
- **Test Event Generator** UI to ingest simulated activity events (Postman-compatible API unchanged)
- Nav entry under Governance

### §3.1 AI System Registry CRUD (UI)

- Wired **Edit** (PATCH), **Archive** (status → Retired), and **Delete** (with confirmation) on the Systems page
- Status field (**Draft / Active / Retired**) on create and edit forms
- Model type selectable (**LLM / ML / Agent / Other**)

### §3.2 Risk Tiering (Manual + Justified)

- Risk tier select + **required justification** on create/edit when a tier is set
- Backend validation: `risk_justification` required whenever `risk_tier` is set (create + update)
- Risk tier + justification shown prominently on system detail
- Risk-tier changes continue to emit audit history

### §3.3 Policy Mapping (Visibility + Flags)

- New `GET /api/v1/policies/catalog` exposing YAML policy → risk-tier mappings
- System detail **Policy Mapping** panel: required policies for the current tier, completeness checks, and **Missing Required Controls** label
- Stronger missing-controls checks (justification, owner, description, sensitivity for PII controls)

### §3.5 Governance Dashboard

- KPI tile now labels **Activity Events** (simulated activity volume)
- New **Events per System** panel (top N) using `events_per_system` from the dashboard summary API

### §4.1 Governance Copilot on Create/Edit

- **Generate Recommendations** on create and edit forms via `POST /api/v1/copilot/systems/draft-recommendations`
- Structured advisory panel with rationale + clarifying questions + disclaimer
- **Apply selected suggestions** (model type, sensitivity, risk tier + justification) — explicit user confirm only; never auto-finalizes tier/policies
- Detail-page recommendations can also apply selected fields via PATCH

---

## 1. Disable Dev Bearer Tokens & Stub User in Production

Dev auth shortcuts (bearer tokens, auto-logged-in stub user) are now locked out of any production build, on both backend and frontend.

### Backend (FastAPI)

Set in production:

```bash
APP_ENV=production
ADMIN_TOKEN=
VIEWER_TOKEN=
```

With `APP_ENV=production`:

- Dev bearer tokens are **not accepted** — `get_actor` only uses Firebase
- The API **refuses to start** if `ADMIN_TOKEN` or `VIEWER_TOKEN` is set
- Fixed a bug where production simultaneously *required* and *forbade* those tokens

### Frontend (Next.js)

1. **Build for production** (`next build` / Vercel production) so `NODE_ENV=production`
2. **Do not set** `NEXT_PUBLIC_DEV_ADMIN_TOKEN` or `NEXT_PUBLIC_DEV_VIEWER_TOKEN`
3. **Do set** real Firebase web config:

   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   # + storage bucket, messaging sender ID, app ID
   ```

**Effect:**

- `getDevBearerToken()` returns `undefined` in production builds
- Without Firebase, the stub user is `null` — no auto-login
- Middleware redirects unauthenticated users to `/login`

### Production Checklist

| Item | Production value |
|---|---|
| `APP_ENV` | `production` |
| `ADMIN_TOKEN` / `VIEWER_TOKEN` | empty / unset |
| `NEXT_PUBLIC_DEV_*` | unset |
| `NEXT_PUBLIC_FIREBASE_*` | set |
| Frontend build command | `next build` (not `next dev`) |

Locally, you can still keep dev tokens set and skip Firebase — production should rely only on Firebase ID tokens.

---

## 2. CSP & Security Headers (Frontend)

Added per-request Content Security Policy and standard security headers, enforced via `middleware.ts` + `lib/security-headers.ts`.

### Content Security Policy

- Nonce-based `script-src` with `strict-dynamic` — Next.js attaches the nonce automatically
- Allowlists only what's needed: your API (`NEXT_PUBLIC_API_BASE_URL`), Firebase Auth, and Google Fonts
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`
- `'unsafe-eval'` allowed only in development
- HSTS and `upgrade-insecure-requests` applied only in production
- `style-src` keeps `'unsafe-inline'` so React's `style={}` prop keeps working

### Additional Headers

Set via middleware and `next.config.js`:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera / mic / geolocation / payment disabled |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | production only |
| `poweredByHeader` | `false` |

### Layout Changes

- Forced dynamic rendering so per-request nonces work correctly
- `nonce` is passed to `ThemeProvider` for next-themes' inline script

### Verifying

Open DevTools → Network → select the document request → check response headers for `Content-Security-Policy`.
