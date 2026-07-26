# Authentication

## Bearer token

Protected routes expect:

```http
Authorization: Bearer <token>
```

## Accepted token types

1. **Development / service tokens**  
   `ADMIN_TOKEN` and `VIEWER_TOKEN` from `.env` match literal bearer values for local and scripted access.

2. **Firebase ID token**  
   When the frontend (or a client) signs in with Firebase Auth, send the **ID token** in the same `Authorization: Bearer` header. The backend verifies it with Firebase Admin (`app/integrations/firebase.py`) when `FIREBASE_PROJECT_ID` and a valid service account are configured.

## Roles

- **Viewer**: read-only access where enforced.  
- **Admin**: create/update/delete systems and other privileged actions.  

Dev tokens map to admin/viewer based on which env value matches. Firebase users may carry a custom claim such as `role: admin` for admin routes (see `app/core/security.py` for the exact logic).

## Frontend

`frontend/lib/api.ts` resolves headers in order: Firebase `getIdToken()` when signed in, then optional `localStorage` token, then `NEXT_PUBLIC_DEV_ADMIN_TOKEN` / `NEXT_PUBLIC_DEV_VIEWER_TOKEN` for local development without Firebase.
