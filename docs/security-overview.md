# Security overview

*A plain-language summary of how TrustFabric protects your data, written for security and procurement reviewers evaluating the platform. For implementation detail, see [architecture.md](architecture.md) and [data-and-storage.md](data-and-storage.md).*

> **Status note:** This page describes controls that exist in the product today, and is explicit about what's in progress or on the roadmap. We'd rather under-claim than have a reviewer catch us overstating something — ask your TrustFabric contact if anything here needs to go into a formal security questionnaire (SIG/CAIQ) response.

## Data isolation

Every customer is an **organization** with its own scoped data. Organization membership and role are checked on every request (`app/core/security.py`), and Firestore security rules (`firestore.rules`) independently enforce the same organization boundary at the database layer — so isolation doesn't depend solely on the API being correct. See [data-and-storage.md](data-and-storage.md) for how collections key data by organization.

## Authentication

- Production sign-in is backed by **Firebase Authentication** (ID tokens verified server-side, including revocation checks). Password-based dev/test bearer tokens are hard-disabled whenever `APP_ENV=production` — the app refuses to start if one is configured.
- **SAML 2.0 SSO** is available per organization (Okta, Entra ID/Azure AD, Google Workspace, or any SAML 2.0 IdP) with optional enforcement that disables password sign-in org-wide. See [sso-saml-setup.md](sso-saml-setup.md).
- SSO sign-in never puts a long-lived token in a URL: the IdP assertion is exchanged for a one-time code, which is redeemed once for a session.

## Authorization

Role-based access control with five organization roles (**owner, admin, security_admin, auditor, viewer**). Write operations (system inventory changes, policy edits, integration connections, SSO/member management) require admin-tier roles; scan and copilot triggers require operator-tier roles — viewers and auditors are read-only by design, including for evidence/audit-log access auditors need for their job.

## Encryption

- **In transit:** HTTPS is required in production; the frontend enforces HSTS and a strict Content-Security-Policy (nonce-based script execution, no wildcard sources) via Next.js middleware.
- **At rest:** third-party integration credentials (GitHub/Slack/Figma tokens) are encrypted with Fernet (AES-128-CBC + HMAC) before being written to Firestore (`app/core/secrets.py`) — never stored in plaintext. Production secrets themselves (encryption keys, API keys, OAuth secrets) are managed through GCP Secret Manager rather than plaintext environment variables — see [secrets-management.md](secrets-management.md).
- Webhook payloads are HMAC-SHA256 signed per delivery so receivers can verify authenticity (`X-TrustFabric-Signature` header).

## Application hardening

- Rate limiting on authentication, scan, copilot, and other expensive endpoints (separate, tighter limits than general API traffic) to blunt brute-force and abuse. *(Currently per-instance in-memory; moving to a shared store for multi-instance deployments is in progress — this affects only rate-limit precision under horizontal scaling, not whether limits are enforced.)*
- Idempotency keys on write endpoints (scan creation and others) prevent duplicate side effects from client retries.
- CORS is explicitly allow-listed per environment; wildcard origins are rejected outright when `APP_ENV=production`.
- Structured, typed request/response validation throughout the API (Pydantic), with a unified error response schema.

## AI / copilot usage

TrustFabric's copilot features (system recommendations, policy drafting) are **advisory only** — every surface that shows AI-generated output displays that disclaimer, and nothing the copilot produces is auto-applied without a human accepting it. LLM interactions are logged (`llm_logs`) for governance review, and org admins can set usage quotas and cost caps per organization. Model routing supports OpenAI-compatible providers, Google Gemini, and Anthropic Claude, selectable per deployment (`COPILOT_PROVIDER`) — no customer data is used to train third-party foundation models beyond each provider's standard API terms (see each provider's data processing terms; TrustFabric does not opt in to model training on API traffic).

## Audit & evidence

- An append-only-style audit log records system, policy, and membership changes (`AuditEvent`), exportable for external auditor handoff.
- LLM interaction logs are exposed via an admin API for governance forensics.
- SIEM/audit export (webhook, S3, or scheduled CSV) is available for organizations that centralize logs externally.
- **Formal immutability guarantees and a documented retention policy for the audit log are on the roadmap**, not yet finalized — ask if this is a hard requirement for your review.

## Availability & operations

- Error tracking (Sentry) is integrated for both backend and frontend.
- Uptime monitoring/alerting and documented Firestore backup/restore procedures are **in progress**, not yet complete.
- An internal [incident response and key-rotation runbook](incident-response.md) is in place.

## Subprocessors

Data and requests may flow through the following third parties, scoped to what each feature requires:

| Subprocessor | Purpose |
|---|---|
| Google Firebase / Firestore | Primary data store, authentication |
| Google Cloud (Secret Manager) | Production secret storage |
| Anthropic (Claude) | Copilot recommendations, policy drafting (when selected/enabled) |
| Google (Gemini) | Copilot recommendations (when selected/enabled) |
| An OpenAI-compatible provider | Copilot recommendations (when configured) |
| GitHub | Repository scanning, when a customer connects the GitHub integration |
| Slack | Notifications, when a customer connects the Slack integration |
| AWS | Cross-account compliance scanning, when a customer connects an AWS role |
| Sentry | Error tracking |

## Compliance program status

TrustFabric is a pre-GA product. We are **not yet** SOC 2 certified and have **not yet** completed a third-party penetration test — both are on the near-term roadmap. If your evaluation requires either as a gating condition, talk to your TrustFabric contact about timeline and interim options (architecture walkthroughs, scoped questionnaire responses).

## Questions

For a completed security questionnaire (SIG/CAIQ), a signed DPA, or anything not covered above, contact your TrustFabric account team.
