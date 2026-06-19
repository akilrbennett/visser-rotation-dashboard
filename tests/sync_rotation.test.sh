#!/usr/bin/env bash
# Verify sync_rotation.sh copies the NEWEST rotation_*.json into data/rotation_latest.json.
# Isolated: backs up + restores the real data files; uses 2099 fixture names so it can't
# collide with the real dated archive.
set -euo pipefail
cd "$(dirname "$0")/.."

backup="$(mktemp -d)"
cp data/rotation_latest.json "$backup/" 2>/dev/null || true
cp data/rotation_2026-06-12.json "$backup/" 2>/dev/null || true

tmp="$(mktemp -d)"
printf '{"old":true}\n' > "$tmp/rotation_2099-01-01.json"; sleep 1
printf '{"new":true}\n' > "$tmp/rotation_2099-06-12.json"
ROTATION_SRC="$tmp" bash scripts/sync_rotation.sh >/dev/null

ok=1
grep -q '"new"' data/rotation_latest.json || ok=0

# Restore real files; remove the fixture-named archive the script created.
rm -f data/rotation_2099-06-12.json
cp "$backup/rotation_latest.json" data/rotation_latest.json 2>/dev/null || true
cp "$backup/rotation_2026-06-12.json" data/rotation_2026-06-12.json 2>/dev/null || true
rm -rf "$tmp" "$backup"

if [ "$ok" = 1 ]; then echo "PASS: newest copied"; else echo "FAIL: newest not copied"; exit 1; fi
