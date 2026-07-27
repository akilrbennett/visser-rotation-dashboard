#!/usr/bin/env bash
# Weekly: copy the newest rotation_*.json from the Cowork research project into data/,
# plus disclosed_moves.json when that folder has one.
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

# Disclosed moves ride along when present. Optional by design: the dashboard hides
# its Disclosed Moves panel entirely when data/disclosed_moves.json is absent, so a
# missing source file is a no-op, never an error.
if [ -f "$SRC/disclosed_moves.json" ]; then
  cp "$SRC/disclosed_moves.json" "$DEST_DIR/disclosed_moves.json"
  echo "Synced disclosed_moves.json -> data/disclosed_moves.json"
else
  echo "No disclosed_moves.json in $SRC, skipped (panel stays hidden)"
fi

echo "Next: git add data/ && git commit -m 'data: rotation $(basename "$newest")' && git push"
