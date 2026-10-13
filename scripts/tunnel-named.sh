#!/usr/bin/env bash
# Fixed HTTPS URL for the phone and the demo: https://rise.nextrex.health -> this laptop.
# Named Cloudflare tunnel "rise" (its own tunnel; Anchor's config.yml is not used). One-time setup, already done:
#   cloudflared tunnel create rise
#   cloudflared tunnel --config /dev/null route dns --overwrite-dns rise rise.nextrex.health
# Needs ~/.cloudflared/cert.pem and the tunnel's credentials JSON in ~/.cloudflared/.
set -euo pipefail
PORT="${PORT:-3400}"
# --config /dev/null: ignore ~/.cloudflared/config.yml, whose `tunnel:` and ingress belong to Anchor.
exec cloudflared tunnel --config /dev/null run --url "http://localhost:${PORT}" rise
