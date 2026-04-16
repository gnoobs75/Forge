#!/usr/bin/env bash
# scripts/remote-tunnel.sh — Start Cloudflare Tunnel to expose Friday remotely
set -euo pipefail

PORT="${FRIDAY_PORT:-3000}"
TOKEN="${FRIDAY_REMOTE_TOKEN:-}"

if [ -z "$TOKEN" ]; then
  echo "⚠ FRIDAY_REMOTE_TOKEN not set — remote clients won't be able to authenticate"
  echo "  Set it in friday/.env: FRIDAY_REMOTE_TOKEN=your-secret-token"
fi

if ! command -v cloudflared &>/dev/null; then
  echo "❌ cloudflared not found. Install it:"
  echo "  Windows: winget install Cloudflare.cloudflared"
  echo "  macOS:   brew install cloudflared"
  echo "  Linux:   https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/"
  exit 1
fi

echo "🚀 Starting Cloudflare Tunnel → http://localhost:$PORT"
echo "   Friday must be running on port $PORT"
echo ""
cloudflared tunnel --url "http://localhost:$PORT"
