from __future__ import annotations

import base64
import hashlib

from cryptography.fernet import Fernet, InvalidToken

from app.core.config import settings

_ENCRYPTED_PREFIX = "enc:v1:"

INTEGRATION_TOKEN_FIELDS = (
    "github_access_token",
    "slack_bot_token",
    "figma_access_token",
)


def _fernet() -> Fernet:
    secret = settings.encryption_key or settings.oauth_state_secret or settings.admin_token
    if not secret:
        raise RuntimeError(
            "ENCRYPTION_KEY (or OAUTH_STATE_SECRET) must be set to protect integration credentials."
        )
    digest = hashlib.sha256(secret.encode()).digest()
    key = base64.urlsafe_b64encode(digest)
    return Fernet(key)


def encrypt_secret(value: str) -> str:
    token = _fernet().encrypt(value.encode("utf-8")).decode("utf-8")
    return f"{_ENCRYPTED_PREFIX}{token}"


def decrypt_secret(value: str) -> str:
    if not value:
        return value
    if not value.startswith(_ENCRYPTED_PREFIX):
        raise RuntimeError(
            "Integration credential is stored in legacy plaintext format. "
            "Reconnect the integration or run the integration token migration."
        )
    payload = value[len(_ENCRYPTED_PREFIX) :]
    try:
        return _fernet().decrypt(payload.encode("utf-8")).decode("utf-8")
    except InvalidToken as exc:
        raise RuntimeError("Failed to decrypt stored integration secret") from exc


def is_encrypted(value: str) -> bool:
    return bool(value) and value.startswith(_ENCRYPTED_PREFIX)
