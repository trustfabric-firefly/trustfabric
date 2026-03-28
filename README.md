## Trust Fabric

Backend API + frontend for AI system inventory, risk governance, and policy recommendations.

- Backend: FastAPI + Uvicorn
- Frontend: Next.js
- Copilot providers: Gemini and Claude (hotswappable via env)
- Storage: in-memory (data resets on backend restart)

## 1) Backend Setup

From the project root:

```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
```

Update `.env` values (minimum local dev):

```env
ADMIN_TOKEN=admin-dev-token
VIEWER_TOKEN=viewer-dev-token
SERVICE_FIREBASE=./service-firebase.json

COPILOT_PROVIDER=gemini
GEMINI_API_KEY=your_key_here
GEMINI_MODEL=gemini-2.5-flash

# Optional fallback
CLAUDE_API_KEY=
ANTHROPIC_MODEL=claude-3-5-sonnet-20241022
```

Run backend:

```bash
uvicorn app.main:app --reload
```

Backend URLs:

- API docs: `http://localhost:8000/docs`
- Health: `http://localhost:8000/health`

## 2) Frontend Setup

In another terminal:

```bash
cd frontend
npm install
npm run dev
```

Open: `http://localhost:3000`

Optional frontend env (`frontend/.env.local`) for local token auth:

```env
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_DEV_ADMIN_TOKEN=admin-dev-token
```

## 3) Copilot Provider Behavior

`COPILOT_PROVIDER` controls routing:

- `gemini`: Gemini only
- `claude`: Claude only
- `auto`: Gemini first, then Claude fallback

## 4) Quick API Test

Create a system:

```bash
curl -X POST "http://localhost:8000/api/v1/systems/" \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer admin-dev-token" \
  -d '{
    "name": "Customer Support Copilot",
    "description": "Drafts and summarizes support replies",
    "owner": "support-team",
    "business_unit": "Customer Support",
    "model_type": "LLM",
    "data_sensitivity": "High",
    "external_integrations": ["Zendesk", "Slack"],
    "status": "Active"
  }'
```

Generate copilot recommendations:

```bash
curl -X POST "http://localhost:8000/api/v1/copilot/systems/1/recommendations" \
  -H "Authorization: Bearer admin-dev-token"
```

## 4) Common Issues

### Frontend shows `Failed to fetch`

- Ensure backend is running on `http://localhost:8000`
- Ensure CORS is enabled (configured in backend app)
- Ensure `NEXT_PUBLIC_API_URL` points to backend

### `No systems found` in AI Generate dropdown

- Systems are in-memory; recreate them after backend restart
- POST to `/api/v1/systems/` with admin token
- Refresh frontend page

### `No copilot provider available (...)`

- Check `.env` provider keys and model
- For Gemini quota errors (`429 RESOURCE_EXHAUSTED`), verify project quota/billing
- If using free tier and quota shows `limit: 0`, the project/key currently has no allocation

### Malformed/truncated Gemini JSON

Backend enforces JSON schema and applies fallback normalization if needed.  
If generation still fails, inspect `raw_response` from the copilot endpoint.

## 6) Main Routes

- `GET /health`
- `GET /api/v1/systems/`
- `POST /api/v1/systems/` (admin)
- `GET /api/v1/systems/{id}`
- `PATCH /api/v1/systems/{id}` (admin)
- `DELETE /api/v1/systems/{id}` (admin)
- `POST /api/v1/events`
- `GET /api/v1/events`
- `GET /api/v1/dashboard`
- `GET /api/v1/audit`
- `POST /api/v1/copilot/systems/{id}/recommendations`

