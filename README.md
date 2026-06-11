## TrustFabric

FastAPI + Next.js **multi-tenant SaaS** for AI **system inventory**, risk tiers, audit/events, and governance copilot features (NIST AI RMF–aligned). Data lives in **Firestore** with **organization-scoped isolation**. The API accepts **dev bearer tokens** (non-production only) and/or **Firebase ID tokens** when configured.

**System recommendations** (`POST /api/v1/copilot/systems/{id}/recommendations`) and **policy text generation** (`POST /api/v1/copilot/policies/recommendations`) can use an **OpenAI-compatible** endpoint, **Gemini**, **Claude**, or **auto** (OpenAI-compatible first, then Gemini, then Claude), controlled by `COPILOT_PROVIDER` in `.env`.

**More detail:** see the **[docs/](docs/)** folder ([index](docs/README.md)) for architecture, Firestore, copilot/LLM behavior, and authentication.

**Repo layout**

```
├── app/                 # FastAPI backend
├── frontend/            # Next.js UI
├── examples/            # Sample JSON bodies for API tests
├── .env.example         # Backend env template (copy → .env)
└── service-firebase.json  # Service account (you create; gitignored)
```

---

### 1. Setup (once per clone)

From the **repo root**:

```bash
python -m venv .venv
source .venv/bin/activate          # Windows: .venv\Scripts\activate
pip install -r requirements.txt
cp .env.example .env
# Edit .env: ADMIN_TOKEN, VIEWER_TOKEN, SERVICE_FIREBASE, FIREBASE_PROJECT_ID, optional OPENAI_* / CLAUDE_API_KEY / GEMINI_* / COPILOT_PROVIDER …
```

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local — at minimum NEXT_PUBLIC_API_BASE_URL; add Firebase keys for real sign-in
cd ..
```

You only create `**.venv**` and run `**npm install**` once (unless dependencies change).

---

### 2. Run backend (each session)

Stay in the **repo root**. **Activate** the same venv, then start the API:

```bash
source .venv/bin/activate          # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Docs: `http://127.0.0.1:8000/docs` · CORS is driven by `cors_origins` in settings (defaults include `http://localhost:3000` and `http://127.0.0.1:3000`).

---

### 3. Run frontend (each session)

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`. See `**frontend/.env.local.example**` for variables.

---

### 4. Env files (summary)


| File                      | Purpose                                                                                                                                                                                                                                    |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `**.env**` (root)         | Backend: tokens, `SERVICE_FIREBASE`, `FIREBASE_PROJECT_ID`, optional `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `CLAUDE_API_KEY`, `GEMINI_API_KEY`, `GEMINI_MODEL`, `COPILOT_PROVIDER`, `POLICIES_FILE`, GitHub/Slack OAuth vars |
| `**frontend/.env.local**` | UI: `NEXT_PUBLIC_API_BASE_URL` (or `NEXT_PUBLIC_API_URL`), optional `NEXT_PUBLIC_FIREBASE_*`, optional `NEXT_PUBLIC_DEV_ADMIN_TOKEN`                                                                                                       |


Do not commit real secrets (`.env`, `.env.local`, `service-firebase.json`).

**Copilot routing (`COPILOT_PROVIDER`):** `openai` · `gemini` · `claude` · `auto` (try OpenAI-compatible first, then Gemini, then Claude on upstream/config errors).

---

### 6. GitHub Integration (optional)

Connect GitHub to scan Copilot configuration, branch protection, vulnerability alerts, and Actions permissions.

1. Go to **GitHub → Settings → Developer settings → OAuth Apps → New OAuth App**
2. Set the **Authorization callback URL** to `http://localhost:8000/api/v1/integrations/github/callback`
3. Add the following to your `.env`:

```bash
GITHUB_CLIENT_ID=your_client_id
GITHUB_CLIENT_SECRET=your_client_secret
GITHUB_REDIRECT_URI=http://localhost:8000/api/v1/integrations/github/callback
FRONTEND_URL=http://localhost:3000
```

1. Restart the backend and click **"Connect GitHub"** in Settings

---

### 7. Slack Integration (optional)

Connect Slack to receive notifications when scans complete, violations are found, or AI systems change.

1. Go to [api.slack.com/apps](https://api.slack.com/apps) and create a new Slack App
2. Under **OAuth & Permissions**, add bot token scopes: `chat:write`, `channels:read`
3. Under **OAuth & Permissions → Redirect URLs**, add `http://localhost:8000/api/v1/integrations/slack/callback`
4. Add the following to your `.env`:

```bash
SLACK_CLIENT_ID=your_client_id
SLACK_CLIENT_SECRET=your_client_secret
SLACK_REDIRECT_URI=http://localhost:8000/api/v1/integrations/slack/callback
```

1. Restart the backend and click **"Connect Slack"** in Settings
2. After authorizing, choose a notification channel from the dropdown and use **"Test Notification"** to verify

---

### 8. AWS Integration (optional)

Connect AWS to run NIST-aligned compliance scans against your cloud infrastructure (IAM, S3, CloudTrail, AWS Config, Security Hub).

1. In your AWS account, create an IAM role:
  - Trusted entity: **Another AWS account** (or your own, secured by External ID)
  - Attach the **SecurityAudit** managed policy (read-only audit access)
  - Optionally attach **AWSSecurityHubReadOnlyAccess** for Security Hub findings
2. Add the following to your `.env`:

```bash
AWS_EXTERNAL_ID=a-unique-string-for-your-deployment
```

1. Restart the backend
2. In TrustFabric **Settings**, paste your IAM Role ARN and select a region, then click **Connect AWS**
3. Go to **Scans** and click **Run AWS Scan** to audit your infrastructure

---

### 5. API auth

Send `Authorization: Bearer <token>` with `ADMIN_TOKEN`, `VIEWER_TOKEN`, or a Firebase **ID token** (when `FIREBASE_PROJECT_ID` is set). Admin-only routes (e.g. create/update/delete systems) need admin (`ADMIN_TOKEN` or Firebase custom claim `role: admin`).

---

### Main routes (reference)

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
- `POST /api/v1/copilot/policies/recommendations`

