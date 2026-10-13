#!/usr/bin/env bash
# Public HTTPS URL for the phone (camera access requires HTTPS). Needs cloudflared:
#   brew install cloudflared
# Quick tunnels need no Cloudflare login; the URL changes every run, so copy it into PUBLIC_BASE_URL.
set -euo pipefail
PORT="${PORT:-3000}"
# --config /dev/null: ignore ~/.cloudflared/config.yml. A named tunnel's ingress rules there
# (ending in http_status:404) would otherwise answer every quick-tunnel request with a 404.
exec cloudflared tunnel --config /dev/null --url "http://localhost:${PORT}"
