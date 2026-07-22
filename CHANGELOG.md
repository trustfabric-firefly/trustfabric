# Changelog

## Pagination for Audit Log, Scans, Systems, and Events APIs

Added pagination to the audit log, scans (GitHub + AWS), systems, and events list APIs.

**Response shape:**

```json
{
  "items": [ /* ... */ ],
  "total": 123,
  "limit": 50,
  "offset": 0,
  "has_more": true
}
```

**Query params:**

| Param    | Default | Max |
|----------|---------|-----|
| `limit`  | 50      | 200 |
| `offset` | 0       | —   |

Example:

```
GET /api/v1/audit/?limit=25&offset=50
```

**Also updated:**

- Shared pagination helper: `app/core/pagination.py`
- Frontend clients now return `Paginated<T>`
- Audit log page has previous/next controls
- Other list pages request the appropriate page size and read from `.items`

---

## SIEM Audit Log Export via Webhooks

Built SIEM-shaped audit log export over webhooks.

**What it does:**

- New event: `audit.created` — fired whenever an audit row is written
- SIEM-shaped payload includes: `source`, `category`, `severity`, `actor_user_id`, `event_type`, `summary`, `occurred_at`, etc.
- HMAC-signed delivery (`X-TrustFabric-Signature`), same scheme as existing scan webhooks

**Example envelope:**

```json
{
  "event": "audit.created",
  "timestamp": "2026-07-10T17:00:00Z",
  "organization_id": "org-1",
  "data": {
    "source": "trustfabric",
    "audit_id": 42,
    "event_type": "system_created",
    "category": "inventory",
    "severity": "info",
    "actor_user_id": "user-1",
    "summary": "Created system X",
    "occurred_at": "2026-07-10T17:00:00Z"
  }
}
```

**API:**

- `GET/POST /api/v1/webhooks/`
- `GET /api/v1/webhooks/events`
- `POST /api/v1/webhooks/{id}/test`
- `PATCH/DELETE /api/v1/webhooks/{id}`

**Setup:** In **Settings → SIEM & webhook export**, paste your unique URL.

> ⚠️ Currently pointed at a temporary [webhooks.site](https://webhook.site) endpoint for testing — swap this for your real SIEM ingestion URL (and rotate the signing secret) before relying on this in production, since testing values shouldn't be treated as long-lived credentials.

Use **Send Test** to confirm the payload arrives at the configured URL.

---

## QoL & Fixes

- Added missing scroll behavior on the **Compliance** page
- Removed mock data from the SOC 2, EU AI Act, and NIST CSF dashboard heatmaps

---

## 1. LLM Interaction Logs — Admin API

`llm_logs` are now exposed via an admin API for forensics.

**Endpoints** (accessible by `owner`, `admin`, `security_admin`):

- `GET /api/v1/llm-logs/`
- `GET /api/v1/llm-logs/{log_id}`

**List filters:**

- `system_id` — filter by AI system
- `user_id` — filter by caller
- `model_name` — filter by model
- `success` — `true` / `false`
- `start` / `end` — ISO timestamps
- `limit` — 1–500 (default 200); newest first

**Each log includes:**

- Timestamp
- User
- System
- Prompt template version
- Input/response summaries
- Model name
- Success flag

Routes are rate limited (default tier) and covered by 5 tests in `tests/test_llm_logs.py`.

---

## 2. Hardened Copilot for Production

- **Timeouts:** 60s default on LLM model calls
- **Transport retries:** up to 2 retries (3 attempts total) with exponential backoff on timeouts, connection errors, `429`, `502`, `503`, `504`
- **Circuit breaker:** after 5 consecutive transport failures per provider, that provider is skipped for 5 minutes and `auto` mode falls through to the next provider
- **JSON fallback:** shared `parse_json_payload` + `build_system_recommendation_fallback` now used by Claude as well as OpenAI/Gemini

**Routing flow (`COPILOT_PROVIDER=auto`):**

1. Skip providers with an open circuit
2. Call provider with timeout + transport retries
3. On `502`/`503`, try the next provider
4. On malformed JSON for system recommendations → structured heuristic fallback (all 3 providers)

**Tests:** 25 new/updated tests in `test/test_llm_resilience.py` and `tests/test_copilot.py`.

---

## 3. Consistent Advisory-Only Disclaimers Across Copilot UI

All copilot UI surfaces now show advisory-only disclaimers consistently.

**Canonical copy:**

> AI-generated recommendations for governance only. Human review required before applying.

Defined once in:

- `frontend/lib/copilot-disclaimer.ts`
- `app/services/copilot_disclaimer.py`

`CopilotAdvisoryNotice` is the shared UI component. Shown on:

- Systems → Recommendation modal
- Systems → Compliance panel
- System → Explain missing
- Policies → AI Generate tab

---

## 4. Per-Org Copilot Usage Quotas and Cost Controls

Enforcement lives in `app/services/copilot_quota.py`. Before any copilot LLM call:

- **Org enabled** — kill switch per org
- **Monthly request limit** — default 200 (0 = unlimited, capped by platform max)
- **Monthly cost cap** — estimated spend from `COPILOT_ESTIMATED_COST_PER_REQUEST_USD` (default: $0.02/request)
- **Per-user daily limit** — default 50 requests/user/day

Over-limit requests return `429` with `Retry-After`.

**Usage is recorded after successful calls for:**

- System recommendations
- Policy generation (including persistent chat)
- Explain-missing controls

**API:**

- `GET /api/v1/organizations/current/copilot-controls` — accessible by all members
- `PATCH /api/v1/organizations/current/copilot-controls` — org admin only

**New `.env` configuration:**

```
COPILOT_DEFAULT_MONTHLY_REQUEST_LIMIT=200
COPILOT_DEFAULT_MONTHLY_COST_CAP_USD=25
COPILOT_DEFAULT_DAILY_REQUEST_LIMIT_PER_USER=50
COPILOT_PLATFORM_MAX_MONTHLY_REQUEST_LIMIT=5000
COPILOT_PLATFORM_MAX_MONTHLY_COST_CAP_USD=500
COPILOT_ESTIMATED_COST_PER_REQUEST_USD=0.02
```

> Admins can lower limits below the default but cannot exceed the platform max.

**UI:**

- **Settings → AI Provider → Copilot usage & cost controls**
  - Shows monthly requests, estimated spend, and limits
  - Admins can toggle copilot, set request limits, cost caps, and per-user daily limit

**Storage (Firestore collections):**

- `organization_copilot_quotas` — per-org limits
- `organization_copilot_usage` — monthly counters
- `organization_copilot_user_daily` — daily per-user counters

**Tests:** `tests/test_copilot_quota.py`
