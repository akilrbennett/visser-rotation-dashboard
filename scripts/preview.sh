#!/usr/bin/env bash
# Local preview. file:// blocks fetch(), so serve over http.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-8080}"
echo "Serving $ROOT at http://localhost:$PORT  (Ctrl-C to stop)"
cd "$ROOT"
exec python3 -m http.server "$PORT"
