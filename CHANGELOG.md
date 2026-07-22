# Changelog

Two security-hardening changes:

1. Dev bearer tokens and the frontend stub user are now fully disabled in production builds — auth relies solely on Firebase ID tokens.
2. The frontend now sends a nonce-based CSP plus a standard set of security headers on every response.

---

## 1. Disable Dev Bearer Tokens & Stub User in Production

Dev auth shortcuts (bearer tokens, auto-logged-in stub user) are now locked out of any production build, on both backend and frontend.

### Backend (FastAPI)

Set in production:

```bash
APP_ENV=production
ADMIN_TOKEN=
VIEWER_TOKEN=
```

With `APP_ENV=production`:

- Dev bearer tokens are **not accepted** — `get_actor` only uses Firebase
- The API **refuses to start** if `ADMIN_TOKEN` or `VIEWER_TOKEN` is set
- Fixed a bug where production simultaneously *required* and *forbade* those tokens

### Frontend (Next.js)

1. **Build for production** (`next build` / Vercel production) so `NODE_ENV=production`
2. **Do not set** `NEXT_PUBLIC_DEV_ADMIN_TOKEN` or `NEXT_PUBLIC_DEV_VIEWER_TOKEN`
3. **Do set** real Firebase web config:

   ```bash
   NEXT_PUBLIC_FIREBASE_API_KEY=...
   NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
   NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
   # + storage bucket, messaging sender ID, app ID
   ```

**Effect:**

- `getDevBearerToken()` returns `undefined` in production builds
- Without Firebase, the stub user is `null` — no auto-login
- Middleware redirects unauthenticated users to `/login`

### Production Checklist

| Item | Production value |
|---|---|
| `APP_ENV` | `production` |
| `ADMIN_TOKEN` / `VIEWER_TOKEN` | empty / unset |
| `NEXT_PUBLIC_DEV_*` | unset |
| `NEXT_PUBLIC_FIREBASE_*` | set |
| Frontend build command | `next build` (not `next dev`) |

Locally, you can still keep dev tokens set and skip Firebase — production should rely only on Firebase ID tokens.

---

## 2. CSP & Security Headers (Frontend)

Added per-request Content Security Policy and standard security headers, enforced via `middleware.ts` + `lib/security-headers.ts`.

### Content Security Policy

- Nonce-based `script-src` with `strict-dynamic` — Next.js attaches the nonce automatically
- Allowlists only what's needed: your API (`NEXT_PUBLIC_API_BASE_URL`), Firebase Auth, and Google Fonts
- `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`
- `'unsafe-eval'` allowed only in development
- HSTS and `upgrade-insecure-requests` applied only in production
- `style-src` keeps `'unsafe-inline'` so React's `style={}` prop keeps working

### Additional Headers

Set via middleware and `next.config.js`:

| Header | Value |
|---|---|
| `X-Content-Type-Options` | `nosniff` |
| `X-Frame-Options` | `DENY` |
| `Referrer-Policy` | `strict-origin-when-cross-origin` |
| `Permissions-Policy` | camera / mic / geolocation / payment disabled |
| `Cross-Origin-Opener-Policy` | `same-origin` |
| `Cross-Origin-Resource-Policy` | `same-origin` |
| `Strict-Transport-Security` | production only |
| `poweredByHeader` | `false` |

### Layout Changes

- Forced dynamic rendering so per-request nonces work correctly
- `nonce` is passed to `ThemeProvider` for next-themes' inline script

### Verifying

Open DevTools → Network → select the document request → check response headers for `Content-Security-Policy`.
