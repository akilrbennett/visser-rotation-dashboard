#!/usr/bin/env bash
# Verify sync_rotation.sh copies the NEWEST rotation_*.json into data/rotation_latest.json,
# and carries disclosed_moves.json across when the source folder has one (and only then).
# Isolated: backs up + restores the real data files; uses 2099 fixture names so it can't
# collide with the real dated archive.
set -euo pipefail
cd "$(dirname "$0")/.."

backup="$(mktemp -d)"
cp data/rotation_latest.json "$backup/" 2>/dev/null || true
cp data/rotation_2026-06-12.json "$backup/" 2>/dev/null || true
had_moves=0
if [ -f data/disclosed_moves.json ]; then cp data/disclosed_moves.json "$backup/"; had_moves=1; fi

restore() {
  rm -f data/rotation_2099-06-12.json
  cp "$backup/rotation_latest.json" data/rotation_latest.json 2>/dev/null || true
  cp "$backup/rotation_2026-06-12.json" data/rotation_2026-06-12.json 2>/dev/null || true
  if [ "$had_moves" = 1 ]; then cp "$backup/disclosed_moves.json" data/disclosed_moves.json
  else rm -f data/disclosed_moves.json; fi
  rm -rf "$tmp" "$backup"
}
trap restore EXIT

tmp="$(mktemp -d)"
printf '{"old":true}\n' > "$tmp/rotation_2099-01-01.json"; sleep 1
printf '{"new":true}\n' > "$tmp/rotation_2099-06-12.json"

# 1) Source has no disclosed_moves.json — rotation still syncs, moves file is left alone.
rm -f data/disclosed_moves.json
ROTATION_SRC="$tmp" bash scripts/sync_rotation.sh >/dev/null
ok=1
grep -q '"new"' data/rotation_latest.json || { echo "FAIL: newest rotation not copied"; ok=0; }
[ -f data/disclosed_moves.json ] && { echo "FAIL: moves file created from a source that has none"; ok=0; }

# 2) Source has one — it lands in data/.
printf '{"moves":[{"date":"2099-01-01"}],"source_videos":1}\n' > "$tmp/disclosed_moves.json"
ROTATION_SRC="$tmp" bash scripts/sync_rotation.sh >/dev/null
grep -q '2099-01-01' data/disclosed_moves.json 2>/dev/null || { echo "FAIL: disclosed_moves.json not copied"; ok=0; }
grep -q '"new"' data/rotation_latest.json || { echo "FAIL: rotation sync regressed"; ok=0; }

if [ "$ok" = 1 ]; then echo "PASS: newest rotation copied; disclosed moves copied only when present"; else exit 1; fi
