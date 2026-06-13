#!/usr/bin/env python3
"""One-shot migration: encrypt legacy plaintext integration tokens in Firestore."""

from __future__ import annotations

import sys


def main() -> int:
    from app.services.store import store

    migrated = store.migrate_plaintext_integration_tokens()
    print(f"Migrated {migrated} organization integration document(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
