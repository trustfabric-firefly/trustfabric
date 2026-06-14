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


def encode_oauth_state(user_id: str, organization_id: str) -> str:
    payload = {
        "user_id": user_id,
        "organization_id": organization_id,
        "exp": int(time.time()) + 600,
    }
    raw = json.dumps(payload, sort_keys=True, separators=(",", ":"))
    sig = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
    blob = json.dumps({**payload, "sig": sig}, separators=(",", ":"))
    return base64.urlsafe_b64encode(blob.encode()).decode()


def decode_oauth_state(state: str) -> tuple[str, str]:
    data = json.loads(base64.urlsafe_b64decode(state.encode()))
    sig = data.pop("sig", "")
    raw = json.dumps(data, sort_keys=True, separators=(",", ":"))
    expected = hmac.new(_secret(), raw.encode(), hashlib.sha256).hexdigest()
    if not hmac.compare_digest(sig, expected):
        raise ValueError("Invalid OAuth state signature")
    if int(data.get("exp", 0)) < int(time.time()):
        raise ValueError("OAuth state expired")
    return str(data["user_id"]), str(data["organization_id"])
