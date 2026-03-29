## TrustFabric

FastAPI + Next.js app for AI **system inventory**, risk tiers, audit/events, and a Claude **governance copilot** (NIST AI RMF–aligned). Data lives in **Firestore**; the API accepts **dev bearer tokens** and/or **Firebase ID tokens** when configured.

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
# Edit .env: ADMIN_TOKEN, VIEWER_TOKEN, SERVICE_FIREBASE, FIREBASE_PROJECT_ID, CLAUDE_API_KEY, …
```

```bash
cd frontend
npm install
cp .env.local.example .env.local
# Edit .env.local — at minimum NEXT_PUBLIC_API_BASE_URL; add Firebase keys for real sign-in
cd ..
```

You only create **`.venv`** and run **`npm install`** once (unless dependencies change).

---

### 2. Run backend (each session)

Stay in the **repo root**. **Activate** the same venv, then start the API:

```bash
source .venv/bin/activate          # Windows: .venv\Scripts\activate
uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Docs: `http://127.0.0.1:8000/docs` · CORS allows `http://localhost:3000` and `http://127.0.0.1:3000`.

---

### 3. Run frontend (each session)

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`. See **`frontend/.env.local.example`** for variables.

---

### 4. Env files (summary)

| File | Purpose |
|------|---------|
| **`.env`** (root) | Backend: tokens, `SERVICE_FIREBASE`, `FIREBASE_PROJECT_ID`, Claude, `POLICIES_FILE` |
| **`frontend/.env.local`** | UI: `NEXT_PUBLIC_API_BASE_URL`, optional `NEXT_PUBLIC_FIREBASE_*`, optional `NEXT_PUBLIC_DEV_ADMIN_TOKEN` |

Do not commit real secrets (`.env`, `.env.local`, `service-firebase.json`).

---

### 5. API auth

Send `Authorization: Bearer <token>` with `ADMIN_TOKEN`, `VIEWER_TOKEN`, or a Firebase **ID token** (when `FIREBASE_PROJECT_ID` is set). Admin-only routes (e.g. create/update/delete systems) need admin (`ADMIN_TOKEN` or Firebase custom claim `role: admin`).

---

### 6. API surface (short)

Systems, events, dashboard, audit under `/api/v1/…`. Copilot: `POST /api/v1/copilot/systems/{id}/recommendations` (no body), `POST /api/v1/copilot/policies/recommendations` with `{ "prompt", "history" }`. Sample payloads: **`examples/`**.

**Note:** One shared Firestore database today — no per-tenant DB isolation in code.
