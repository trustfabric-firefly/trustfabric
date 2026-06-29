#!/usr/bin/env bash
# Deploy Firestore security rules and composite indexes to the configured Firebase project.
#
# Usage:
#   FIREBASE_PROJECT_ID=your-project ./scripts/deploy-firestore-rules.sh
#   # or set FIREBASE_PROJECT_ID in .env and run:
#   ./scripts/deploy-firestore-rules.sh
#
# Auth (pick one):
#   - firebase login (interactive)
#   - GOOGLE_APPLICATION_CREDENTIALS=./service-firebase.json
#   - FIREBASE_TOKEN from CI

set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

PROJECT_ID="${FIREBASE_PROJECT_ID:-}"
if [[ -z "$PROJECT_ID" && -f service-firebase.json ]]; then
  PROJECT_ID="$(python3 -c "import json; print(json.load(open('service-firebase.json'))['project_id'])")"
fi

if [[ -z "$PROJECT_ID" ]]; then
  echo "Error: set FIREBASE_PROJECT_ID in .env or provide service-firebase.json" >&2
  exit 1
fi

if [[ ! -f firestore.rules ]]; then
  echo "Error: firestore.rules not found in repo root" >&2
  exit 1
fi

echo "Deploying Firestore rules and indexes to project: $PROJECT_ID"

npx --yes firebase-tools@latest deploy \
  --only firestore \
  --project "$PROJECT_ID" \
  --non-interactive

echo "Firestore rules and indexes deployed successfully."
