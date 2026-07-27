#!/usr/bin/env bash
# auto_publish_rotation.sh
# Zero-touch publisher for the AI Macro Nexus rotation dashboard.
# Installed as LaunchAgent com.akilbennett.rotation-autopublish (daily 09:00 local).
# Safe to run anytime: it NO-OPS unless a newer rotation week exists in the Cowork
# research folder. Pushes to GitHub (HTTPS + osxkeychain); GitHub Pages redeploys.
set -uo pipefail

REPO="$HOME/Developer/visser-rotation-dashboard"
ROTATION_SRC="${ROTATION_SRC:-/Users/arb30/Documents/Claude/Projects/AI Thematic Research}"
LOG="$HOME/Library/Logs/rotation-autopublish.log"
export PATH="/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin:$PATH"

log() { echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >>"$LOG"; }

log "---- run start ----"
cd "$REPO" 2>/dev/null || { log "ERROR: repo not found at $REPO"; exit 1; }

# 1) Sync local main with origin first (pulls in the daily price-bot commits) so our push fast-forwards.
git fetch --quiet origin main 2>>"$LOG" || { log "ERROR: git fetch failed"; exit 1; }
git pull --rebase --autostash --quiet origin main 2>>"$LOG" || { log "ERROR: git pull --rebase failed"; exit 1; }

# 2) Copy the newest rotation_*.json from the research folder into data/.
ROTATION_SRC="$ROTATION_SRC" ./scripts/sync_rotation.sh >>"$LOG" 2>&1 || { log "ERROR: sync_rotation.sh failed"; exit 1; }

# 3) Anything new to publish?
if [ -z "$(git status --porcelain data/)" ]; then
  log "no rotation change — nothing to publish"
  log "---- run end ----"
  exit 0
fi

newest="$(ls -t "$ROTATION_SRC"/rotation_*.json 2>/dev/null | head -1)"
wk="$(basename "${newest:-rotation_unknown.json}" | sed -e 's/^rotation_//' -e 's/\.json$//')"

git add data/ 2>>"$LOG"
git commit -m "data: rotation ${wk} (auto)" >>"$LOG" 2>&1 || { log "ERROR: commit failed"; exit 1; }

# 4) Push, with one rebase-retry in case the price bot pushed mid-run.
if git push --quiet origin main 2>>"$LOG"; then
  log "PUBLISHED rotation ${wk}"
else
  log "push rejected — rebasing and retrying"
  git pull --rebase --autostash --quiet origin main 2>>"$LOG"
  if git push --quiet origin main 2>>"$LOG"; then
    log "PUBLISHED rotation ${wk} (after retry)"
  else
    log "ERROR: push failed (check auth / network)"
    exit 1
  fi
fi
log "---- run end ----"
