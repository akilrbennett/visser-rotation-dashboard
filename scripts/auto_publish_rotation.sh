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
changed="$(git status --porcelain data/)"
if [ -z "$changed" ]; then
  log "no data change, nothing to publish"
  log "---- run end ----"
  exit 0
fi

newest="$(ls -t "$ROTATION_SRC"/rotation_*.json 2>/dev/null | head -1)"
wk="$(basename "${newest:-rotation_unknown.json}" | sed -e 's/^rotation_//' -e 's/\.json$//')"

# Label the commit for what actually moved, since data/ now also carries disclosed_moves.json,
# which can change on its own without a new rotation week.
rot_changed=0; mv_changed=0
printf '%s\n' "$changed" | grep -q 'data/rotation_'          && rot_changed=1
printf '%s\n' "$changed" | grep -q 'data/disclosed_moves\.json' && mv_changed=1
if [ "$rot_changed" = 1 ] && [ "$mv_changed" = 1 ]; then
  msg="data: rotation ${wk} + disclosed moves (auto)"
elif [ "$rot_changed" = 1 ]; then
  msg="data: rotation ${wk} (auto)"
elif [ "$mv_changed" = 1 ]; then
  msg="data: disclosed moves (auto)"
else
  msg="data: refresh (auto)"
fi

git add data/ 2>>"$LOG"
git commit -m "$msg" >>"$LOG" 2>&1 || { log "ERROR: commit failed"; exit 1; }

# 4) Push, with one rebase-retry in case the price bot pushed mid-run.
if git push --quiet origin main 2>>"$LOG"; then
  log "PUBLISHED $msg"
else
  log "push rejected — rebasing and retrying"
  git pull --rebase --autostash --quiet origin main 2>>"$LOG"
  if git push --quiet origin main 2>>"$LOG"; then
    log "PUBLISHED $msg (after retry)"
  else
    log "ERROR: push failed (check auth / network)"
    exit 1
  fi
fi
log "---- run end ----"
