#!/usr/bin/env bash
# ============================================================================
#  ONE-TIME provisioning for the FRONTEND EC2 (Ubuntu 22.04).
#  Run as the `ubuntu` user:   bash deploy/frontend/setup-frontend.sh
#
#  Assumes the repo is cloned to ~/enterprise-hrms.
#  Before running: edit deploy/frontend/nginx-hrms.conf and replace
#  BACKEND_PRIVATE_IP with the backend EC2's private IPv4.
# ============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/enterprise-hrms}"
NODE_MAJOR=20
WEB_ROOT="/var/www/hrms"

echo "==> [1/6] System packages + nginx"
sudo apt-get update -y
sudo apt-get install -y git curl ca-certificates gnupg nginx

echo "==> [2/6] Node.js $NODE_MAJOR (NodeSource) — needed to build the bundle"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

echo "==> [3/6] Frontend production env"
cd "$REPO_DIR"
if [ ! -f .env.production ]; then
  cp deploy/frontend/.env.production.example .env.production
  echo "   Created .env.production (VITE_API_BASE_URL=/api)."
fi

echo "==> [4/6] Install deps + build"
npm ci || npm install
npm run build   # outputs ./dist

echo "==> [5/6] Publish build to $WEB_ROOT"
sudo mkdir -p "$WEB_ROOT"
sudo rsync -a --delete "$REPO_DIR/dist/" "$WEB_ROOT/"

echo "==> [6/6] nginx site config"
sudo cp "$REPO_DIR/deploy/frontend/nginx-hrms.conf" /etc/nginx/sites-available/hrms
sudo ln -sf /etc/nginx/sites-available/hrms /etc/nginx/sites-enabled/hrms
sudo rm -f /etc/nginx/sites-enabled/default
if grep -q "BACKEND_PRIVATE_IP" /etc/nginx/sites-available/hrms; then
  echo "ERROR: replace BACKEND_PRIVATE_IP in /etc/nginx/sites-available/hrms with the backend private IP, then: sudo nginx -t && sudo systemctl reload nginx" >&2
  exit 1
fi
sudo nginx -t
sudo systemctl enable nginx
sudo systemctl reload nginx

echo ""
echo "✅ Frontend live. Open:  http://<this-instance-public-ip>/"
