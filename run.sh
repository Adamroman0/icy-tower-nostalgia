#!/usr/bin/env bash
# Serve the Lava Tower game locally.
# Usage:  ./run.sh        (foreground; Ctrl-C to stop)
cd "$(dirname "$0")"
PORT="${1:-8099}"
echo "Serving Lava Tower at http://localhost:$PORT/index.html  (Ctrl-C to stop)"
exec python3 -m http.server "$PORT" --bind 0.0.0.0
