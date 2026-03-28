## Trust Fabric Backend

- **What it does**: API for AI system inventory, risk tiers, policy flags, events, audit log, and an AI “governance copilot” aligned to the NIST AI RMF.
- **Tech**: Python, FastAPI, Uvicorn, in-memory store (DB-ready), optional Firebase auth, Anthropic Claude, Google Gemini.

### How to run it

```bash
cd TrustFabric
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt

cp .env.example .env
# In .env edit and fill in the required values.
# All required environment variables are listed in .env.example.
uvicorn app.main:app --reload
```
## Firebase Credentials

1. Download your **Firebase service account JSON** from the Firebase Console.
2. Rename the file: service-firebase.json
3. Place the file in the project root directory.

````bash
4. Ensure .env contains (gitignore):
SERVICE_FIREBASE=./service-firebase.json
````

## Diagnostics for HTTP API
```bash



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

### Copilot provider (hotswappable)

Set these in `.env`:

- `COPILOT_PROVIDER=auto` (`auto`, `gemini`, `claude`)
- `GEMINI_API_KEY=...`
- `GEMINI_MODEL=gemini-1.5-pro` (optional)
- `CLAUDE_API_KEY=...` (optional fallback if Gemini fails)
- `ANTHROPIC_MODEL=claude-3-5-sonnet-20241022` (optional)

With `COPILOT_PROVIDER=auto`, the backend tries Gemini first, then falls back to Claude.

