#!/usr/bin/env bash
# Run by launchd every 60 s (health.nextrex.rise.watchdog). If the app stops answering /api/health on two checks
# in a row, restart it. Covers the case KeepAlive can't: a process that is alive but not serving (e.g. a
# graceful shutdown stuck waiting on the tunnel's keep-alive connections).
PORT="${PORT:-3400}"
STATE="$HOME/Library/Logs/rise/watchdog.misses"
if curl -s -o /dev/null -m 5 -f "http://localhost:$PORT/api/health"; then
  echo 0 > "$STATE"
  exit 0
fi
misses=$(( $(cat "$STATE" 2>/dev/null || echo 0) + 1 ))
echo "$misses" > "$STATE"
echo "$(date '+%F %T') health check failed ($misses in a row)"
if (( misses >= 2 )); then
  echo "$(date '+%F %T') restarting health.nextrex.rise.app"
  launchctl kickstart -k "gui/$(id -u)/health.nextrex.rise.app"
  echo 0 > "$STATE"
fi
