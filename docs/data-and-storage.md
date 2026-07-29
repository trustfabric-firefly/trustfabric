# Data & storage

## Backend store

TrustFabric persists application data in **Google Cloud Firestore**, not an in-process memory map. The implementation is `FirestoreStore` in `app/services/store.py`; all reads/writes to Firestore go through it.

## Lazy initialization

Importing the Python package does **not** require valid Firebase credentials: the Firestore client is created on first use (`_client()`), when a route or service touches the store. If `SERVICE_FIREBASE` is missing or the file path is wrong, operations that need Firestore fail with a clear error at that point rather than at import time — important for running tests without credentials.

## Document IDs

- Numeric-entity collections (`systems`, `events`, `audits`, `llm_logs`) use **stringified monotonic integer IDs**, generated from a per-organization counter document in `_counters` (e.g. `system_id_seq`).
- Everything else uses either a natural key (`organizations/{org_id}`), a composite key (`organization_members/{org_id}_{user_id}`), or a generated UUID/hex string (scans, jobs, webhooks, SSO exchange codes).

## Collections

Every collection below is **organization-scoped** — either the document itself carries `organization_id` (checked on every read in the service layer) or the document ID is namespaced by org ID. Firestore security rules (`firestore.rules`) independently enforce the same boundary for any direct client SDK access, so isolation doesn't rely solely on the API being correct.

| Collection | Doc ID | Key fields | Model |
|---|---|---|---|
| `organizations` | `{org_id}` | `name`, `created_at`, `created_by`, `plan`, `compliance_contact_email` | `Organization` |
| `organization_members` | `{org_id}_{user_id}` | `organization_id`, `user_id`, `role` (`owner`\|`admin`\|`security_admin`\|`auditor`\|`viewer`), `email`, `joined_at` | `OrganizationMember` |
| `organization_invites` | `{invite_id}` | `organization_id`, `email`, `role`, `invited_by`, `status` (`pending`\|`accepted`\|`revoked`), `created_at`, `accepted_at` | `OrganizationInvite` |
| `organization_sso` | `{org_id}` | `enabled`, `enforced`, `idp_entity_id`, `idp_sso_url`, `idp_x509_cert`, `email_domains[]`, `jit_provisioning`, `default_role`, `updated_at` | `OrganizationSsoConfig` |
| `sso_exchange_codes` | `{code}` | `user_id`, `organization_id`, `email`, `return_to`, `expires_at` — one-time, 5-minute TTL | — |
| `organization_copilot_quotas` | `{org_id}` | `enabled`, `monthly_request_limit`, `monthly_cost_cap_usd`, `daily_request_limit_per_user` | `OrganizationCopilotQuota` |
| `organization_copilot_usage` | `{org_id}_{period}` | `request_count`, `estimated_cost_usd`, `last_request_at` | `OrganizationCopilotUsage` |
| `organization_copilot_user_daily` | `{org_id}_{user_id}_{date}` | per-user daily request count, for the daily quota check | — |
| `organization_integrations` | `{org_id}` | Nested per-provider status/credentials for GitHub, Slack, AWS, Figma — tokens encrypted at rest (`app/core/secrets.py`) | `GitHub/Slack/Aws/FigmaIntegrationStatus` |
| `systems` | `{system_id}` (int) | `organization_id`, `name`, `description`, `owner`, `business_unit`, `model_type`, `data_sensitivity`, `status`, `risk_tier`, `required_policies[]`, `last_scan_id`, `compliance_score` | `AISystem` |
| `systems/{id}/policies` | `{policy_id}` | `name`, `category`, `severity`, `applies_to[]`, `creation_method` (`manual`\|`template`\|`ai_generated`), `status`, `rules`, `version` | `GovernancePolicy` |
| `systems/{id}/copilot_chat` | `{message_id}` | `role` (`user`\|`ai`), `content`, `provider`, `model`, `created_at` | `AIChatMessage` |
| `events` | `{event_id}` (int) | `organization_id`, `system_id`, `timestamp`, `user_id`, `event_type`, `metadata` | `ActivityEvent` |
| `audits` | `{audit_id}` (int) | `organization_id`, `event_type` (system/policy/member changes), `target_id`, `user_id`, `timestamp`, `summary` | `AuditEvent` |
| `llm_logs` | `{log_id}` (int) | `organization_id`, `user_id`, `system_id`, `prompt_template_version`, `input_summary`, `model_name`, `response_summary`, `success` | `LLMInteractionLog` |
| `scans` | `{scan_id}` | `organization`, `timestamp`, `config` (scope, github_org, policies_checked), `results` (score, violations, compliant), `status`, `triggered_by` | `ScanRecord` |
| `scans/{id}/frameworks` | `{framework_id}` | Per-framework (NIST AI RMF, SOC 2, EU AI Act) requirement scoring for that scan | `FrameworkResult` |
| `aws_scans` | `{scan_id}` | `account_id`, `region`, `compliance_score`, `checks[]`, `status` | `AwsScanRecord` |
| `attestations` | `{attestation_id}` | Manual attestation evidence for non-auto-evaluable framework requirements | — |
| `scan_policies` | `{check_id}` | `name`, `description`, `severity`, `enabled`, `tier` (`personal`\|`enterprise`), `user_id` — which checks run in a scan | `ScanPolicy` |
| `jobs` | `{job_id}` | `job_type` (`github_scan`\|`aws_scan`), `organization_id`, `user_id`, `status`, `resource_id`, `error`, timestamps | `JobRecord` |
| `webhook_endpoints` | `{webhook_id}` | `organization_id`, `url`, `events[]` (`scan.completed`, `scan.failed`, `compliance.alert`, `audit.created`), `secret` (HMAC signing key), `enabled` | `WebhookEndpoint` |
| `idempotency_keys` | `{org_id}_{key}` | `method`, `path`, `status` (`processing`\|`completed`), `status_code`, `response_body`, TTL via `IDEMPOTENCY_TTL_HOURS` | `IdempotencyRecord` |
| `_counters` | `{org_id}` | Per-entity-type monotonic counters (`system_id_seq`, `event_id_seq`, …) used to mint integer IDs | — |

## Service account

The same JSON key file used for Firestore (`SERVICE_FIREBASE` / `FIREBASE_CREDENTIALS_FILE`) is used by Firebase Admin when verifying ID tokens, so the project it belongs to must match `FIREBASE_PROJECT_ID`. In staging/production this credential is provisioned per-environment — see [deployment-environments.md](deployment-environments.md).

## Indexes

Composite indexes required for the queries above are declared in `firestore.indexes.json` and deployed with `./scripts/deploy-firestore-rules.sh` alongside `firestore.rules`.

## Known gap

Several list endpoints (systems, events, scans, audit) currently scope by organization by filtering in Python after a broader Firestore read rather than a server-side `where(organization_id == ...)` query — tracked as an open item ("fix full-collection Firestore queries that filter by org in Python"). This does **not** affect the isolation guarantee (results are still filtered before ever leaving the API, and Firestore rules independently block direct client access across orgs) — it's a query-efficiency issue at scale, not a data-boundary issue.
