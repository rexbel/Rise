#!/usr/bin/env bash
# Run the "rise" Cloudflare tunnel (https://rise.nextrex.health -> localhost:3400) as a macOS login service,
# so it survives closed terminals, app restarts, and reboots. Same pattern as Anchor's tunnel service.
#   bash scripts/install-tunnel-service.sh            install or update, then start
#   bash scripts/install-tunnel-service.sh uninstall  stop and remove
# Logs: ~/Library/Logs/rise/tunnel.log. The dev server itself still has to be running on the port.
set -euo pipefail
LABEL="health.nextrex.rise.tunnel"
DEST="$HOME/Library/LaunchAgents/$LABEL.plist"
DOMAIN="gui/$(id -u)"

if [[ "${1:-}" == "uninstall" ]]; then
  launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
  rm -f "$DEST"
  echo "Removed $LABEL"
  exit 0
fi

CLOUDFLARED="$(command -v cloudflared)" || { echo "cloudflared not found (brew install cloudflared)"; exit 1; }
PORT="${PORT:-3400}"
SRC="$(cd "$(dirname "$0")" && pwd)/launchd/$LABEL.plist"

mkdir -p "$HOME/Library/Logs/rise" "$HOME/Library/LaunchAgents"
sed -e "s#__CLOUDFLARED__#$CLOUDFLARED#" -e "s#__HOME__#$HOME#g" -e "s#__PORT__#$PORT#" "$SRC" > "$DEST"
plutil -lint "$DEST" >/dev/null

launchctl bootout "$DOMAIN/$LABEL" 2>/dev/null || true
launchctl bootstrap "$DOMAIN" "$DEST"
launchctl kickstart -k "$DOMAIN/$LABEL"
echo "Started $LABEL -> https://rise.nextrex.health (localhost:$PORT). Logs: ~/Library/Logs/rise/tunnel.log"
