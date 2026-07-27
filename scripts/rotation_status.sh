#!/usr/bin/env bash
# rotation_status.sh — READ-ONLY status check for the AI Macro Nexus rotation pipeline.
# Answers: "should the dashboard be published?" without changing anything.
# Compares (1) newest technical dashboard, (2) newest processed rotation_*.json,
# (3) what's live on the site — and prints the one action, if any, that's pending.
set -uo pipefail

SRC="${ROTATION_SRC:-/Users/arb30/Documents/Claude/Projects/AI Thematic Research}"
REPO="$HOME/Developer/visser-rotation-dashboard"
THEM="$SRC/visser/Thematic Research & Ideas"

newest_dash=$(ls -1 "$THEM"/AI_Macro_Nexus_Technical_v3_*.xlsx 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort | tail -1)
newest_rot=$(ls -1 "$SRC"/rotation_*.json 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | sort | tail -1)
deployed=$(grep -oE '"current_week"[^0-9]*[0-9]{4}-[0-9]{2}-[0-9]{2}' "$REPO/data/rotation_latest.json" 2>/dev/null | grep -oE '[0-9]{4}-[0-9]{2}-[0-9]{2}' | tail -1)

echo "AI Macro Nexus — rotation status ($(date '+%Y-%m-%d %H:%M'))"
echo "  Newest technical dashboard (research folder) : ${newest_dash:-none}"
echo "  Newest processed rotation_*.json             : ${newest_rot:-none}"
echo "  Currently live on the dashboard              : ${deployed:-none}"
echo

if [ -n "$newest_dash" ] && { [ -z "$newest_rot" ] || [[ "$newest_dash" > "$newest_rot" ]]; }; then
  echo "==> INTAKE NEEDED"
  echo "    A newer dashboard ($newest_dash) has NOT been processed into the tracker yet."
  echo "    Action: run the visser-weekly intake (it advances the tracker + writes rotation_$newest_dash.json),"
  echo "    then the publish step below."
elif [ -n "$newest_rot" ] && { [ -z "$deployed" ] || [[ "$newest_rot" > "$deployed" ]]; }; then
  echo "==> PUBLISH NEEDED"
  echo "    rotation $newest_rot is ready but the live site still shows ${deployed:-none}."
  echo "    Action (now): launchctl kickstart -k gui/\$(id -u)/com.akilbennett.rotation-autopublish"
  echo "    (or just wait for the daily 9am agent.)"
else
  echo "==> UP TO DATE — the live dashboard reflects the newest processed rotation (${deployed:-none}). Nothing to do."
fi
