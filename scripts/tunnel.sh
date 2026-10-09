#!/usr/bin/env bash
# Public HTTPS URL for the phone (camera access requires HTTPS). Needs cloudflared:
#   brew install cloudflared
# Quick tunnels need no Cloudflare login; the URL changes every run, so copy it into PUBLIC_BASE_URL.
set -euo pipefail
PORT="${PORT:-3000}"
exec cloudflared tunnel --url "http://localhost:${PORT}"
