#!/usr/bin/env bash
# Weekly: copy the newest rotation_*.json from the Cowork research project into data/.
# Run locally (the GitHub Action has no access to this folder). Then commit + push.
set -euo pipefail

SRC="${ROTATION_SRC:-/Users/arb30/Documents/Claude/Projects/AI Thematic Research}"
DEST_DIR="$(cd "$(dirname "$0")/.." && pwd)/data"

if [ ! -d "$SRC" ]; then
  echo "ERROR: source folder not found: $SRC" >&2
  echo "Set ROTATION_SRC to your 'AI Thematic Research' folder." >&2
  exit 1
fi

newest="$(ls -t "$SRC"/rotation_*.json 2>/dev/null | head -1 || true)"
if [ -z "$newest" ]; then
  echo "ERROR: no rotation_*.json found in $SRC" >&2
  exit 1
fi

cp "$newest" "$DEST_DIR/rotation_latest.json"
cp "$newest" "$DEST_DIR/$(basename "$newest")"   # keep a dated archive too
echo "Synced $(basename "$newest") -> data/rotation_latest.json"
echo "Next: git add data/ && git commit -m 'data: rotation $(basename "$newest")' && git push"
