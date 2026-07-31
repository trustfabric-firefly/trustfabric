#!/usr/bin/env python3
"""
Seed Pre-Configured Industry AI Systems for TrustFabric.

Categories supported:
- all: All 15 industry presets
- calculated_risk: Calculated Risk (Macroeconomic & Housing Analysis)
- sisu_energy: Sisu Energy LLC (Frac Sand Logistics & Fleet)
- solaris_tech: Solaris Technologies Services (Mobile Towers & Power)
- trellis_energy: Trellis Energy Partners (Energy Private Equity & Underwriting)
- enterprise: Core Enterprise & IT Infrastructure
"""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

# Add project root to python path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.domain.system_presets import (
    PRESET_SYSTEMS,
    get_presets_by_category,
    list_preset_categories,
)
from app.services.store import store


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed TrustFabric AI Systems from Industry Presets")
    parser.add_argument(
        "--org-id",
        type=str,
        default="default",
        help="Target organization ID (default: 'default')",
    )
    parser.add_argument(
        "--category",
        type=str,
        default="all",
        choices=["all", "calculated_risk", "sisu_energy", "solaris_tech", "trellis_energy", "enterprise"],
        help="Preset category to seed (default: 'all')",
    )
    parser.add_argument(
        "--user-id",
        type=str,
        default="cli-admin",
        help="User ID for audit trail (default: 'cli-admin')",
    )

    args = parser.parse_args()

    presets = get_presets_by_category(args.category)
    print(f"🚀 Seeding {len(presets)} system preset(s) for organization '{args.org_id}' (category: '{args.category}')...")

    try:
        existing_systems = store.list_systems(args.org_id)
        existing_names = {s.name.lower().strip() for s in existing_systems}
    except Exception as e:
        print(f"⚠️  Database connection note: {e}")
        print("ℹ️  To seed live data into Firestore, ensure SERVICE_FIREBASE in .env points to a valid service account JSON file.")
        print(f"\n📋 Previewing {len(presets)} system preset(s) that will be created:\n")
        for idx, p in enumerate(presets, 1):
            print(f"  {idx}. [{p.category_id}] {p.name}")
            print(f"     Business Unit: {p.business_unit} | Risk: {p.risk_tier} | Type: {p.model_type}")
            print(f"     Description: {p.description}")
            print(f"     Integrations: {', '.join(p.external_integrations)}\n")
        return

    created_count = 0
    skipped_count = 0

    for preset in presets:
        if preset.name.lower().strip() in existing_names:
            print(f"  [SKIP] '{preset.name}' already exists.")
            skipped_count += 1
            continue

        payload = preset.to_create_payload()
        system = store.create_system(payload, user_id=args.user_id, organization_id=args.org_id)
        created_count += 1
        print(f"  [CREATED] ID {system.id}: '{system.name}' ({system.business_unit}) - Risk: {system.risk_tier}")

    print("\n✅ Seeding complete!")
    print(f"   Created: {created_count} system(s)")
    print(f"   Skipped: {skipped_count} existing system(s)")
    print(f"   Total active systems in org '{args.org_id}': {len(store.list_systems(args.org_id))}")


if __name__ == "__main__":
    main()
