#!/usr/bin/env bash
# Keep https://rise.nextrex.health up as macOS login services (survive closed terminals, app restarts, reboots).
# Same pattern as Anchor's services:
#   health.nextrex.rise.app     production `next start` on :3400 (built from this checkout)
#   health.nextrex.rise.tunnel  Cloudflare named tunnel "rise" -> localhost:3400
#   health.nextrex.rise.watchdog  every 60 s: restarts the app if /api/health fails twice in a row
#
#   bash scripts/install-services.sh             build, then install or update and start both
#   bash scripts/install-services.sh tunnel      tunnel only (e.g. while running `next dev` on :3400 yourself)
#   bash scripts/install-services.sh app         restart the app on the current build (npm run deploy:local)
#   bash scripts/install-services.sh uninstall   stop and remove both
# After code changes: npm run deploy:local (rebuild + restart the app). Logs: ~/Library/Logs/rise/{app,tunnel}.log
set -euo pipefail
DOMAIN="gui/$(id -u)"
REPO="$(cd "$(dirname "$0")/.." && pwd)"
PORT="${PORT:-3400}"
WHAT="${1:-all}"

# bootout sends SIGTERM; next-server's graceful shutdown can hang on the tunnel's keep-alive connections,
# which leaves the job loaded and makes the next bootstrap fail. Wait briefly, then force it.
stop_job() {
  local pid
  pid=$(launchctl print "$DOMAIN/$1" 2>/dev/null | grep -E "^[[:space:]]*pid = " | head -1 | sed 's/.*= //' || true)
  launchctl bootout "$DOMAIN/$1" 2>/dev/null || true
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "$DOMAIN/$1" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
  if [[ -n "$pid" ]]; then kill -9 "$pid" 2>/dev/null || true; fi
  for _ in 1 2 3 4 5 6 7 8 9 10; do
    launchctl print "$DOMAIN/$1" >/dev/null 2>&1 || return 0
    sleep 0.5
  done
}

remove() {
  stop_job "$1"
  rm -f "$HOME/Library/LaunchAgents/$1.plist"
}

if [[ "$WHAT" == "uninstall" ]]; then
  remove health.nextrex.rise.watchdog
  remove health.nextrex.rise.app
  remove health.nextrex.rise.tunnel
  echo "Removed Rise services"
  exit 0
fi

NODE="$(command -v node)" || { echo "node not found"; exit 1; }
CLOUDFLARED="$(command -v cloudflared)" || { echo "cloudflared not found (brew install cloudflared)"; exit 1; }
mkdir -p "$HOME/Library/Logs/rise" "$HOME/Library/LaunchAgents"

install_one() {
  local label="$1" dest="$HOME/Library/LaunchAgents/$1.plist"
  sed -e "s#__CLOUDFLARED__#$CLOUDFLARED#g" -e "s#__NODE__#$NODE#g" -e "s#__REPO__#$REPO#g" \
      -e "s#__HOME__#$HOME#g" -e "s#__PORT__#$PORT#g" -e "s#__PATH__#$(dirname "$NODE"):/usr/bin:/bin#g" \
      "$REPO/scripts/launchd/$label.plist" > "$dest"
  plutil -lint "$dest" >/dev/null
  stop_job "$label"
  launchctl bootstrap "$DOMAIN" "$dest"
  [[ "$label" == *watchdog ]] || launchctl kickstart -k "$DOMAIN/$label"
  echo "Started $label"
}

if [[ "$WHAT" == "app" ]]; then
  install_one health.nextrex.rise.app
  exit 0
fi

if [[ "$WHAT" == "all" ]]; then
  if lsof -iTCP:"$PORT" -sTCP:LISTEN -t >/dev/null 2>&1 && ! launchctl print "$DOMAIN/health.nextrex.rise.app" >/dev/null 2>&1; then
    echo "Port $PORT is in use by something else (a dev server?). Stop it first, or use: $0 tunnel"
    exit 1
  fi
  (cd "$REPO" && npm run build)
  install_one health.nextrex.rise.app
  install_one health.nextrex.rise.watchdog
fi
install_one health.nextrex.rise.tunnel
echo "https://rise.nextrex.health -> localhost:$PORT. Logs: ~/Library/Logs/rise/"
