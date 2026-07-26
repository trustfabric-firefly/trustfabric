# SSO / SAML setup guide (enterprise admins)

This guide is for an **admin at a customer organization** setting up SAML 2.0 single sign-on for their TrustFabric workspace. It walks through connecting Okta, Microsoft Entra ID (Azure AD), Google Workspace, or any other SAML 2.0 identity provider (IdP).

If you're a TrustFabric engineer looking for the implementation, see [`app/services/sso.py`](../app/services/sso.py) and [`app/api/routes/sso.py`](../app/api/routes/sso.py) instead.

## What you'll need

- An **Owner**, **Admin**, or **Security Admin** role in your TrustFabric organization (Settings is read-only for other roles).
- Admin access to your identity provider to create a new SAML application.
- 10–15 minutes; SSO is enabled the moment you save a valid configuration, no deploy or restart required.

## How it works, briefly

TrustFabric is the SAML **Service Provider (SP)**; your IdP is the **Identity Provider**. Each organization has its own SP entity ID and Assertion Consumer Service (ACS) URL, so one TrustFabric deployment can serve SAML SSO to many customer organizations independently — your configuration only affects your organization.

Sign-in flow: a user enters their work email on the TrustFabric login page → TrustFabric looks up whether that email's domain has SSO configured → if so, they're redirected to your IdP → your IdP authenticates them and posts a signed assertion back to TrustFabric's ACS URL → TrustFabric verifies the signature, exchanges it for a short-lived one-time code, and signs the user into your organization. No long-lived token ever appears in a URL or browser history.

## Step 1: Get your Service Provider details

Go to **Settings → SAML SSO** in TrustFabric. Three values are generated automatically for your organization — you'll paste these into your IdP:

| Field | What it is |
|---|---|
| **SP Entity ID** | `{api_base_url}/api/v1/auth/sso/{your_org_id}/metadata` — identifies TrustFabric to your IdP |
| **ACS URL** | `{api_base_url}/api/v1/auth/sso/acs` — where your IdP posts the sign-in response |
| **Metadata URL** | A public XML document with both of the above, formatted for IdPs that support "import by URL" |

These are read-only and specific to your organization — don't reuse another org's values.

## Step 2: Create the app in your identity provider

The exact screens vary by IdP, but every SAML 2.0 provider asks for the same three things: your **Entity ID**, your **ACS / Reply URL**, and a **NameID format**. Use `emailAddress` as the NameID format — TrustFabric identifies users by email.

**Okta**
1. Applications → Create App Integration → **SAML 2.0**.
2. Single sign-on URL / ACS URL: paste the **ACS URL** from Step 1. Check "Use this for Recipient URL and Destination URL" if offered.
3. Audience URI (SP Entity ID): paste the **SP Entity ID** from Step 1.
4. Name ID format: **EmailAddress**. Application username: **Email**.
5. Assign the app to the users/groups who should get SSO access.
6. On the app's **Sign On** tab, copy the **Identity Provider Single Sign-On URL**, the **Identity Provider Issuer** (Entity ID), and download the **X.509 certificate** — you'll need all three in Step 3.

**Microsoft Entra ID (Azure AD)**
1. Entra ID → Enterprise applications → New application → **Create your own application** → Non-gallery.
2. Single sign-on → **SAML**.
3. Basic SAML Configuration: Identifier (Entity ID) = **SP Entity ID** from Step 1; Reply URL (ACS URL) = **ACS URL** from Step 1.
4. Attributes & Claims: ensure the **Unique User Identifier (Name ID)** claim source is `user.mail` (or `user.userprincipalname` if your tenant's UPNs are real email addresses), format **Email address**.
5. SAML Certificates: copy **Login URL**, **Microsoft Entra Identifier** (Entity ID), and download the **Certificate (Base64)**.
6. Assign users/groups under **Users and groups**.

**Google Workspace**
1. Admin console → Apps → Web and mobile apps → Add app → **Add custom SAML app**.
2. Google Identity Provider details page gives you the **SSO URL**, **Entity ID**, and **Certificate** — copy all three.
3. Service provider details: ACS URL = **ACS URL** from Step 1; Entity ID = **SP Entity ID** from Step 1; Name ID format = **EMAIL**.
4. Turn the app **ON** for the relevant organizational units.

**Any other SAML 2.0 IdP:** the same three inputs (ACS URL, Entity ID, NameID = email) and three outputs (SSO URL, IdP Entity ID, X.509 certificate) apply — consult your provider's SAML app docs if the naming differs.

## Step 3: Configure TrustFabric with your IdP's details

Back in **Settings → SAML SSO**, fill in:

| Field | Value |
|---|---|
| **IdP Entity ID** | The Entity ID / Issuer from your IdP |
| **IdP SSO URL** | The Single Sign-On / Login URL from your IdP |
| **IdP X.509 certificate** | Paste the full PEM certificate (including `-----BEGIN CERTIFICATE-----` / `-----END CERTIFICATE-----`) |
| **Allowed email domains** | Comma-separated domains (e.g. `yourcompany.com`) — only users signing in with these domains via this IdP will be accepted |
| **JIT provisioning** | See below |
| **Default role for new SSO users** | Role assigned to a user the first time they sign in via SSO (if JIT provisioning is on) |
| **Enable SAML SSO** | Turns the connection on |
| **Enforce SSO** | See below |

Click **Save**. TrustFabric validates that all required fields are present before accepting the config.

### Just-in-time (JIT) provisioning

If **JIT provisioning** is on, the first successful SSO sign-in for a given email automatically creates a membership in your organization at the **default role**. If it's off, users must already have a pending invite or existing membership — SSO only authenticates them, it doesn't add them to the org.

Only users whose email domain is in **Allowed email domains** can be JIT-provisioned or authenticate at all — this is what prevents someone with an account on your IdP tenant but an unexpected email domain from getting in.

### Enforce SSO

With **Enforce SSO** on, the TrustFabric login page hides the password field entirely for anyone whose email matches your domain(s) and redirects them straight to your IdP — password sign-in is disabled org-wide. Turn this on once you've verified SSO works end-to-end (Step 4); turning it on before testing can lock out your own admin account if the IdP config has a mistake, since there is currently no separate "break-glass" password bypass once enforced.

## Step 4: Test sign-in

1. Open an incognito/private browser window.
2. Go to your TrustFabric login page and enter a work email in your allowed domain.
3. You should see **"[Your org] uses SSO"** appear, and be redirected to your IdP after submitting.
4. Sign in at your IdP. You should land back in TrustFabric, signed in to the correct organization.

Test with an account that is **not** your primary admin account before turning on **Enforce SSO**, so you always have a way back in if something's misconfigured.

## Rotating your IdP certificate

IdP certificates expire (Okta/Entra typically issue multi-year certs, but rotation does happen). Before the old certificate expires, get the new one from your IdP and paste it into **IdP X.509 certificate** in Settings — saving updates it immediately, with no downtime, since TrustFabric always validates against whatever certificate is currently saved.

## Troubleshooting

| Symptom | Likely cause |
|---|---|
| "SSO configuration incomplete: …" on save | One of the required fields (IdP Entity ID, SSO URL, certificate, or at least one email domain) is empty |
| "Email domain is not authorized for this organization" | The signing-in user's email domain isn't in **Allowed email domains** |
| "Your account is not a member of this organization. Contact your administrator." | JIT provisioning is off and the user has no existing invite/membership — invite them first, or enable JIT provisioning |
| "SAML authentication failed: …" after IdP redirect | Usually a certificate mismatch (re-copy the cert from your IdP, watch for line-ending issues) or a clock skew between your IdP and TrustFabric's server (SAML assertions have a short validity window) |
| 503 "SAML support is not installed on this server" | Backend deployment issue, not a config issue — contact TrustFabric support |
| Redirect loop or blank page after IdP sign-in | Confirm the ACS URL registered in your IdP matches **exactly** what's shown in TrustFabric Settings (including scheme — `https://`) |

If none of these match, contact your TrustFabric account team with the exact error text and the timestamp of the failed attempt.
