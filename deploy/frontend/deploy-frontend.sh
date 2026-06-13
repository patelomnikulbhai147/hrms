#!/usr/bin/env bash
# ============================================================================
#  UPDATE the frontend with the latest code.  Run on the FRONTEND EC2:
#     bash deploy/frontend/deploy-frontend.sh
#  Pulls the current branch, rebuilds, and republishes to nginx.
# ============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/enterprise-hrms}"
BRANCH="${BRANCH:-$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)}"
WEB_ROOT="/var/www/hrms"

echo "==> Pulling latest ($BRANCH)"
git -C "$REPO_DIR" fetch origin "$BRANCH"
git -C "$REPO_DIR" reset --hard "origin/$BRANCH"

echo "==> Build"
cd "$REPO_DIR"
# Skip Puppeteer's Chromium download (not needed to build) and raise V8's heap
# so the Vite build doesn't OOM on small (1GB) instances. Pair with a swap file.
export PUPPETEER_SKIP_DOWNLOAD=true
export NODE_OPTIONS="${NODE_OPTIONS:---max-old-space-size=2048}"
npm ci || npm install
npm run build

echo "==> Publish to $WEB_ROOT (atomic-ish sync)"
sudo rsync -a --delete "$REPO_DIR/dist/" "$WEB_ROOT/"
sudo systemctl reload nginx

echo "✅ Frontend updated. Hard-refresh the browser (Ctrl+Shift+R)."
