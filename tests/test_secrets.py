import os

import pytest

os.environ.setdefault("ENCRYPTION_KEY", "test-encryption-key")
os.environ.setdefault("OAUTH_STATE_SECRET", "test-oauth-secret")

from app.core.secrets import decrypt_secret, encrypt_secret, is_encrypted


def test_encrypt_decrypt_roundtrip():
    plain = "gho_test_token_value"
    encrypted = encrypt_secret(plain)
    assert is_encrypted(encrypted)
    assert decrypt_secret(encrypted) == plain


def test_legacy_plaintext_passthrough():
    legacy = "gho_legacy_plaintext"
    assert decrypt_secret(legacy) == legacy
    assert not is_encrypted(legacy)


def test_empty_value():
    assert decrypt_secret("") == ""
    assert decrypt_secret(encrypt_secret("")) == ""
