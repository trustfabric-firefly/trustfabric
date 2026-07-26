#!/usr/bin/env python3
"""Export the live FastAPI OpenAPI schema to docs/openapi.json.

Usage (from repo root, with venv active):

    python scripts/export_openapi.py
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))

from app.main import app  # noqa: E402


def main() -> None:
    app.openapi_schema = None
    schema = app.openapi()
    out = ROOT / "docs" / "openapi.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(json.dumps(schema, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {out.relative_to(ROOT)} ({len(schema.get('paths', {}))} paths)")


if __name__ == "__main__":
    main()
