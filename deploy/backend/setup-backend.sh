#!/usr/bin/env bash
# ============================================================================
#  ONE-TIME provisioning for the BACKEND EC2 (Ubuntu 22.04).
#  Run as the `ubuntu` user:   bash deploy/backend/setup-backend.sh
#
#  Assumes the repo is already cloned to ~/enterprise-hrms and that you have
#  created backend/.env from deploy/backend/.env.production.example.
# ============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/enterprise-hrms}"
BACKEND_DIR="$REPO_DIR/backend"
NODE_MAJOR=20

echo "==> [1/6] System packages"
sudo apt-get update -y
sudo apt-get install -y git build-essential ca-certificates curl gnupg

echo "==> [2/6] Node.js $NODE_MAJOR (NodeSource)"
if ! command -v node >/dev/null 2>&1 || [ "$(node -v | cut -d. -f1 | tr -d v)" -lt "$NODE_MAJOR" ]; then
  curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | sudo -E bash -
  sudo apt-get install -y nodejs
fi
node -v && npm -v

echo "==> [3/6] PM2 (process manager)"
sudo npm install -g pm2
mkdir -p "$HOME/logs"

echo "==> [4/6] Backend dependencies (production)"
cd "$BACKEND_DIR"
if [ ! -f .env ]; then
  echo "ERROR: $BACKEND_DIR/.env missing. Copy it from deploy/backend/.env.production.example and edit it first." >&2
  exit 1
fi
npm ci --omit=dev || npm install --omit=dev

echo "==> [5/6] Prisma client + database schema sync"
npx prisma generate
# Sync the database to schema.prisma. We use `db push` (not `migrate deploy`)
# because the committed migration SQL mixes table-name casing (CREATE `Attendance`
# vs ALTER `attendance`), which breaks on case-sensitive MySQL (Linux/RDS).
# `db push` builds straight from schema.prisma in one consistent pass.
# Idempotent and non-destructive: it only applies the diff, never drops data.
npx prisma db push

echo "==> [6/6] Start under PM2 + enable on boot"
pm2 start "$REPO_DIR/deploy/backend/ecosystem.config.cjs" || pm2 reload hrms-backend
pm2 save
# Print the command to enable PM2 on boot (run the line it outputs, once):
pm2 startup systemd -u "$USER" --hp "$HOME" | tail -n 1 || true

echo ""
echo "✅ Backend up. Test locally on the instance:"
echo "   curl http://localhost:5000/api/health"
