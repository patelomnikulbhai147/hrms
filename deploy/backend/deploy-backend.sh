#!/usr/bin/env bash
# ============================================================================
#  UPDATE the backend with the latest code.  Run on the BACKEND EC2:
#     bash deploy/backend/deploy-backend.sh
#  Pulls the current branch, installs deps, applies new migrations, zero-downtime
#  reloads PM2.
# ============================================================================
set -euo pipefail

REPO_DIR="${REPO_DIR:-$HOME/enterprise-hrms}"
BRANCH="${BRANCH:-$(git -C "$REPO_DIR" rev-parse --abbrev-ref HEAD)}"
BACKEND_DIR="$REPO_DIR/backend"

echo "==> Pulling latest ($BRANCH)"
git -C "$REPO_DIR" fetch origin "$BRANCH"
git -C "$REPO_DIR" reset --hard "origin/$BRANCH"

echo "==> Installing backend deps"
cd "$BACKEND_DIR"
npm ci --omit=dev || npm install --omit=dev

echo "==> Prisma generate + schema sync (db push)"
npx prisma generate
# db push (not migrate deploy) — the committed migrations mix table-name casing
# which fails on case-sensitive MySQL/RDS. Syncs schema.prisma; never drops data.
npx prisma db push

echo "==> Reloading PM2 (zero downtime)"
pm2 reload hrms-backend
pm2 save

echo "✅ Backend updated. curl http://localhost:5000/api/health"
