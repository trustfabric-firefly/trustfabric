## Trust Fabric Backend

- **What it does**: API for AI system inventory, risk tiers, policy flags, events, audit log, and a Claude “governance copilot” aligned to the NIST AI RMF.
- **Tech**: Python, FastAPI, Uvicorn, in-memory store (DB-ready), optional Firebase auth, Anthropic Claude.

### How to run it

```bash
cd TrustFabric
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# In .env, set at least:
# - ADMIN_TOKEN / VIEWER_TOKEN (for local auth)
# - CLAUDE_API_KEY (for copilot)
# -  FIREBASE_PROJECT_ID / FIREBASE_CREDENTIALS_FILE
# - (optional) POLICIES_FILE (e.g., policies.yaml)

uvicorn app.main:app --reload
```

Open `http://localhost:8000/docs` for interactive API docs.

### Main routes (backend only)

- **Health**: `GET /health`
- **Systems**:
  - `GET /api/v1/systems`
  - `POST /api/v1/systems` (admin)
  - `GET /api/v1/systems/{id}`
  - `PATCH /api/v1/systems/{id}` (admin)
  - `DELETE /api/v1/systems/{id}` (admin)
- **Events**:
  - `POST /api/v1/events`
  - `GET /api/v1/events`
- **Dashboard**: `GET /api/v1/dashboard`
- **Audit log**: `GET /api/v1/audit`
- **Governance Copilot (Claude)**:
  - `POST /api/v1/copilot/systems/{id}/recommendations`

All protected routes expect `Authorization: Bearer <token>` where `<token>` is:
- `ADMIN_TOKEN` / `VIEWER_TOKEN` (local dev), or
- a Firebase ID token if `FIREBASE_PROJECT_ID` is configured.

### Policies (YAML)

- Required policies for each risk tier are loaded from a YAML file:
  - Default: internal safe config.
  - Override: set `POLICIES_FILE` in `.env` (see `policies.example.yaml` for format).

