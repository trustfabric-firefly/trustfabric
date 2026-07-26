# Incident response & key rotation runbook

Internal runbook for handling a suspected security incident (leaked credential, compromised account, reported vulnerability) and for routine/emergency rotation of production secrets. Not customer-facing — see [security-overview.md](security-overview.md) for what's shared externally.

## Severity levels

| Level | Definition | Example |
|---|---|---|
| **SEV1** | Active or confirmed exposure of customer data, or an attacker has valid credentials | A production `ENCRYPTION_KEY` or Firebase service account key is committed to a public repo |
| **SEV2** | A real vulnerability found, no evidence yet of exploitation | A dependency CVE affecting an in-use library; an auth bypass found in review |
| **SEV3** | Internal-only risk, no customer data path | A leaked dev-only `ADMIN_TOKEN` on a local machine |

Default to the higher severity when unsure — you can downgrade after triage, but a slow SEV1 response is the expensive mistake.

## Response process

1. **Detect** — via Sentry alert, customer report, internal discovery, or (once running) uptime/metrics alerting.
2. **Triage** — what's exposed, which organization(s) are affected, is it still ongoing? Don't skip this to jump straight to rotating things — rotating the wrong secret first can also cause an outage on top of the incident.
3. **Contain**, in order of urgency:
   - If a user/session is compromised: force sign-out via Firebase (`revoke_refresh_tokens` for the affected `uid` — see `app/integrations/firebase.py`; token revocation checking is already enforced on every request).
   - If a secret is leaked: rotate it immediately (see table below) — don't wait for root cause.
   - If an integration credential (GitHub/Slack/Figma/AWS) is suspected compromised: disconnect the integration for the affected org from Settings, or revoke it at the provider directly if org access isn't available.
4. **Eradicate** — patch the underlying cause (code fix, revoked key, closed access), not just the symptom.
5. **Recover** — redeploy, smoke-test (sign in, create a system, run a scan), confirm the fix holds.
6. **Notify** — internal stakeholders immediately; affected customers per your DPA/contractual obligations once scope is confirmed (see [security-overview.md](security-overview.md) — a formal DPA process is still on the roadmap, so handle notification manually and conservatively until it exists).
7. **Postmortem** — root cause, timeline, what would have caught it sooner, and update this doc if the process itself had a gap.

## Current ownership (fill in / confirm — no formal on-call yet)

Based on who currently owns each area per the project tracker; confirm before relying on this during an actual incident:

| Area | Suggested primary |
|---|---|
| Backend / secrets / config | Joseph |
| Infra / deploy / Docker | Pranjal |
| Security hardening / integrations | Yasmin |
| Monitoring / ops | Peter |

There is no formal on-call rotation yet ("document incident response … runbooks" was itself an open item) — treat this table as a starting point, not a guarantee someone is watching 24/7.

## Key rotation procedures

Secrets in Secret Manager are read once at process start (see [secrets-management.md](secrets-management.md#rotation)) — every rotation below ends with **add a new secret version, then redeploy**, not a live update.

| Secret | Rotate via | Blast radius if rotated without prep | Notes |
|---|---|---|---|
| `ENCRYPTION_KEY` | Generate: `python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"` | **Breaks decryption of every already-stored GitHub/Slack/Figma token.** Do not rotate blind. | Re-encrypt existing tokens with the new key *before* switching `ENCRYPTION_KEY`, using both keys side by side (decrypt with old, encrypt with new, write back) — see procedure below. If you rotate without this step, every customer's connected integrations break and must be manually reconnected. |
| `OAUTH_STATE_SECRET` | Generate a new random string | Low — invalidates only OAuth/SSO logins that are mid-flow (a few seconds to minutes) | Safe to rotate any time; no stored data depends on it |
| `ADMIN_TOKEN` / `VIEWER_TOKEN` | Change locally | None (dev-only; must be empty in production) | |
| Firebase service account key | Firebase Console → Project Settings → Service Accounts → generate new key, then delete the old one | Old key keeps working until explicitly deleted — deleting it is the actual containment step, not just generating a new one | Update `SERVICE_FIREBASE` / the Secret Manager secret and redeploy before deleting the old key |
| `GITHUB_CLIENT_SECRET` / `SLACK_CLIENT_SECRET` | Regenerate in the GitHub OAuth App / Slack App developer console | Low — this is TrustFabric's single operator-level OAuth app, not a per-customer credential | Update Secret Manager, redeploy, confirm a fresh Connect flow works |
| `CLAUDE_API_KEY` / `OPENAI_API_KEY` / `GEMINI_API_KEY` | Provider console | Low, but copilot requests fail until redeployed | Confirm a copilot request works on the new key before revoking the old one at the provider |
| `AWS_ACCESS_KEY_ID` / `AWS_SECRET_ACCESS_KEY` | AWS IAM console | Low — affects only AWS compliance scanning | Deactivate (don't delete) the old key until an AWS scan succeeds on the new one |
| Per-org webhook secret | Customer regenerates it themselves in Settings | N/A | Not a TrustFabric-side rotation — it's customer-controlled |

### `ENCRYPTION_KEY` rotation procedure (re-encrypt before switching)

```python
# Run once, with BOTH the old and new key available, before changing the
# deployed ENCRYPTION_KEY. Adapt from app/core/secrets.py + app/services/store.py.
import os
os.environ["ENCRYPTION_KEY"] = "<OLD_KEY>"
from app.core import secrets as enc
from app.services.store import store

new_key = "<NEW_KEY>"
for org_doc in store._client().collection(store._integrations_collection).stream():
    data = org_doc.to_dict()
    changed = False
    for field in enc.INTEGRATION_TOKEN_FIELDS:
        val = data.get(field)
        if val and enc.is_encrypted(val):
            plain = enc.decrypt_secret(val)
            os.environ["ENCRYPTION_KEY"] = new_key
            data[field] = enc.encrypt_secret(plain)
            os.environ["ENCRYPTION_KEY"] = "<OLD_KEY>"
            changed = True
    if changed:
        org_doc.reference.set(data, merge=True)
```

Then set `ENCRYPTION_KEY` to `<NEW_KEY>` everywhere (Secret Manager + redeploy) and confirm a connected integration still works. This is a manual, one-off procedure today — worth turning into a proper script if key rotation becomes routine rather than incident-driven.

## Suspected leak — quick checklist

1. Identify exactly which secret(s) leaked and where (git history, logs, a screenshare, a compromised laptop).
2. Rotate that secret first, following the table above — don't wait to finish investigating.
3. Check access logs where available (GCP Secret Manager access logs, Firebase Auth logs, Sentry) for use of the leaked credential before rotation.
4. If it was committed to git: rotating the secret is mandatory regardless of whether you also scrub git history — the value must be treated as permanently public.
5. File the postmortem once contained, even if it turns out to be a false alarm — the record is the useful part.
