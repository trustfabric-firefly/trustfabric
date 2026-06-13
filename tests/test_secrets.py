from __future__ import annotations

import pytest

from app.core import secrets
from app.core.config import settings
from app.services.store import FirestoreStore


@pytest.fixture(autouse=True)
def _encryption_key(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setattr(settings, "encryption_key", "test-encryption-key")
    monkeypatch.setattr(settings, "oauth_state_secret", "")
    monkeypatch.setattr(settings, "admin_token", "")


def test_encrypt_decrypt_roundtrip() -> None:
    plain = "ghp_test_token_abc123"
    encrypted = secrets.encrypt_secret(plain)
    assert secrets.is_encrypted(encrypted)
    assert secrets.decrypt_secret(encrypted) == plain


def test_decrypt_rejects_plaintext() -> None:
    with pytest.raises(RuntimeError, match="legacy plaintext"):
        secrets.decrypt_secret("ghp_legacy_plaintext_token")


def test_encrypt_integration_fields_skips_already_encrypted() -> None:
    plain = "xoxb-slack-token"
    encrypted = secrets.encrypt_secret(plain)
    doc = {"slack_bot_token": encrypted}
    result = FirestoreStore._encrypt_integration_fields(doc)
    assert result["slack_bot_token"] == encrypted


def test_encrypt_integration_fields_encrypts_plaintext() -> None:
    plain = "figd_plain_token"
    result = FirestoreStore._encrypt_integration_fields({"figma_access_token": plain})
    assert secrets.is_encrypted(result["figma_access_token"])
    assert secrets.decrypt_secret(result["figma_access_token"]) == plain
