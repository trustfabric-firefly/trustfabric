# TrustFabric documentation

This folder holds deeper documentation than the root [README](../README.md). Use it for onboarding, architecture, and operational detail.

| Document | Contents |
|----------|----------|
| [Architecture](architecture.md) | Components, request flow, tech stack, frontend structure |
| [Data & storage](data-and-storage.md) | Firestore collection schema, IDs, lazy init |
| [Copilot & LLM](copilot-and-llm.md) | Gemini vs Claude, policy generation, env |
| [Authentication](authentication.md) | Dev tokens, Firebase ID tokens, roles |
| [SSO / SAML setup](sso-saml-setup.md) | Step-by-step guide for enterprise admins (Okta, Entra ID, Google Workspace) |
| [Secrets management](secrets-management.md) | GCP Secret Manager loader, setup, rotation |
| [Deployment environments](deployment-environments.md) | Staging vs production separation — projects, secrets, deploy targets |
| [Security overview](security-overview.md) | Trust-center-style summary for buyers/security reviewers |
| [Incident response & key rotation](incident-response.md) | Internal runbook — severity levels, response process, per-secret rotation procedures |

On GitHub, browse this folder in the repository file tree or open any `.md` file for rendered Markdown.
