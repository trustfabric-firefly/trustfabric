## NIST AI RMF–Aligned Claude Integration (Backend Perspective)

- **Purpose**: This backend exposes a `copilot` API that generates **advisory-only** governance recommendations for AI systems using Claude (Anthropic), aligned with the **NIST AI Risk Management Framework** (Govern, Map, Measure, Manage).
- **Scope**: Prototype-level integration for a single-tenant governance prototype (Trust Fabric), not production-grade assurance.

### Govern – Roles, Policies, and Accountability

- **Backend enforces simple roles**:
  - `Admin`: full CRUD + risk/policy changes.
  - `Viewer`: read-only, but can still request recommendations for visibility.
- **API key handling**:
  - Claude API key is stored **server-side only** via environment variables (`CLAUDE_API_KEY`).
  - No front-end exposure; all LLM traffic flows through backend routes.
- **Advisory-only design**:
  - `copilot` route returns recommendations + disclaimer; actual risk tier / policy fields are only changed via explicit admin CRUD calls.

### Map – Context and Risk Characterization

- **System context captured in registry**:
  - Name, description, owner, business unit, model type, data sensitivity, external integrations, status.
- **Prompt construction** (`services/claude.py`):
  - Builds a structured description of the AI system and asks Claude to suggest:
    - Model type, data sensitivity, risk tier.
    - Required policies (`logging_required`, `human_review_required`, `pii_restrictions`).
    - 3–8 clarifying questions.
- **Input limiting**:
  - Prompt is length-limited (`MAX_INPUT_CHARS`) to manage cost and reduce inadvertent over-sharing.

### Measure – Logging, Monitoring, and Evidence

- **LLM interaction logging**:
  - For each copilot call, backend records:
    - Timestamp, user ID, system ID, prompt template version, input summary, model name, response summary, success/failure.
  - This supports **auditability** and later analysis of LLM behavior.
- **Event and audit logs**:
  - Core backend already records:
    - System CRUD, risk tier changes, policy changes (audit events).
    - Simulated activity events per system (for governance dashboards).

### Manage – Controls, Safeguards, and Operations

- **Rate limiting**:
  - Simple in-memory token-bucket per client IP (`rate_limit_per_minute`) to reduce prompt abuse and protect the Claude API.
- **Failure handling**:
  - Network/API failures mapped to user-friendly HTTP 5xx with a generic message.
  - Failed interactions are still logged with `success=False` for investigation.
- **Separation of concerns**:
  - Backend:
    - Owns system-of-record, logs, and Claude integration.
  - Frontend:
    - Renders recommendations, asks humans to confirm final risk tiers and policies, enforces “advisory only” UX.

