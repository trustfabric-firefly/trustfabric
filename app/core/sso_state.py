from __future__ import annotations

import base64
import hashlib
import hmac
import json
import time

from app.core.config import settings


def _secret() -> bytes:
    secret = settings.oauth_state_secret or settings.admin_token or "trustfabric-dev-state"
    return secret.encode()


def encode_sso_state(organization_id: str, return_to: str) -> str:
    payload = {
        "organization_id": organization_id,
        "return_to": return_to,
        "exp": int(time.time()) + 600,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    sig = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
    blob = json.dumps({**payload, "sig": sig}, separators=(",", ":"))
    return base64.urlsafe_b64encode(blob.encode()).decode()


def decode_sso_state(state: str) -> tuple[str, str]:
    data = json.loads(base64.urlsafe_b64decode(state.encode()))
    sig = data.pop("sig", "")
    raw = json.dumps(data, sort_keys=True, separators=(",", ":"))
    expected = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("Invalid SSO state signature")
    if int(data.get("exp", 0)) < int(time.time()):
        raise ValueError("SSO state expired")
    return str(data["organization_id"]), str(data.get("return_to") or "/dashboard")
