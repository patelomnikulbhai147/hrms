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
npm ci || npm install
npm run build

echo "==> Publish to $WEB_ROOT (atomic-ish sync)"
sudo rsync -a --delete "$REPO_DIR/dist/" "$WEB_ROOT/"
sudo systemctl reload nginx

echo "✅ Frontend updated. Hard-refresh the browser (Ctrl+Shift+R)."
