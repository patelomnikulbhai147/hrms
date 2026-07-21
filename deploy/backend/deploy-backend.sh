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
# NOT --omit=dev: `prisma` (the CLI, needed for `prisma generate`) is a devDependency.
PUPPETEER_SKIP_DOWNLOAD=1 npm ci || PUPPETEER_SKIP_DOWNLOAD=1 npm install

echo "==> Prisma generate"
npx prisma generate

# ─────────────────────────────────────────────────────────────────────────────
#  SCHEMA CHANGES ARE **NOT** APPLIED AUTOMATICALLY.
#
#  This step used to run `npx prisma db push`. That was destructive: the live
#  database has drifted from schema.prisma, so db push resolves the difference
#  by DELETING whatever the schema does not mention. Verified against production
#  on 2026-07-21, db push would have run:
#      DROP TABLE custom_reports;  DROP TABLE custom_report_versions;
#      ALTER TABLE Employee DROP COLUMN serviceBookNo;
#      ALTER TABLE Payroll  DROP COLUMN leaveEncashmentAmount, leaveEncashmentDays;
#  …and then likely aborted part-way on a UNIQUE index that existing rows violate,
#  leaving the server half-deployed.
#
#  Schema changes are therefore applied DELIBERATELY, with an additive, idempotent
#  script per change (backend/scripts/add*.js — they only CREATE/ADD, never DROP).
#  Run the one your change needs BEFORE this script, then deploy.
#
#  To see what the schema currently expects vs. what production has (READ-ONLY):
#      npx prisma migrate diff --from-url "$DATABASE_URL" \
#          --to-schema-datamodel prisma/schema.prisma --script
#
#  Set ALLOW_DB_PUSH=1 to override — only after reading that diff and confirming
#  every DROP in it is intentional.
# ─────────────────────────────────────────────────────────────────────────────
if [ "${ALLOW_DB_PUSH:-0}" = "1" ]; then
  echo "==> ⚠️  ALLOW_DB_PUSH=1 — running prisma db push (destructive!)"
  npx prisma db push
else
  echo "==> Skipping db push (safe default). Apply schema changes with backend/scripts/add*.js"
fi

echo "==> Reloading PM2 (zero downtime)"
pm2 reload hrms-backend
pm2 save

echo "✅ Backend updated. curl http://localhost:5000/api/health"
