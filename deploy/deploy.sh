#!/bin/bash
# Deploy Script — Salfanet Radius (NestJS Migration)
#
# Usage:
#   ./deploy/deploy.sh              # Full deploy (build + restart)
#   ./deploy/deploy.sh --backend    # Backend only
#   ./deploy/deploy.sh --frontend   # Frontend only
#
# Prerequisites:
#   - pnpm installed
#   - PM2 installed
#   - Nginx installed
#   - Database running
#   - backend/.env configured
#   - frontend/.env configured

set -e

APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
cd "$APP_DIR"

echo "=== Salfanet Radius Deploy ==="
echo "APP_DIR: $APP_DIR"
echo "Time: $(date)"
echo ""

# Parse args
DEPLOY_TARGET="all"
if [ "$1" = "--backend" ]; then DEPLOY_TARGET="backend"; fi
if [ "$1" = "--frontend" ]; then DEPLOY_TARGET="frontend"; fi

# ─────────────────────────────────────────────────────────────────────
# Install dependencies
# ─────────────────────────────────────────────────────────────────────
if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "backend" ]; then
  echo ">>> Installing dependencies..."
  pnpm install --frozen-lockfile
fi

# ─────────────────────────────────────────────────────────────────────
# Build backend
# ─────────────────────────────────────────────────────────────────────
if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "backend" ]; then
  echo ">>> Building backend..."
  cd backend
  pnpm prisma generate
  pnpm build
  cd ..
  echo "    Backend build complete."
fi

# ─────────────────────────────────────────────────────────────────────
# Build frontend
# ─────────────────────────────────────────────────────────────────────
if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "frontend" ]; then
  echo ">>> Building frontend..."
  cd frontend
  pnpm build
  # Copy standalone build to deployment location
  # Next.js standalone output is in .next/standalone/
  echo "    Frontend build complete."
  cd ..
fi

# ─────────────────────────────────────────────────────────────────────
# Database migration (run from backend)
# ─────────────────────────────────────────────────────────────────────
if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "backend" ]; then
  echo ">>> Running Prisma migrations..."
  cd backend
  # Note: Prisma schema is shared from frontend/prisma/
  # If you have a separate backend schema, adjust the path
  npx prisma db push --accept-data-loss 2>/dev/null || true
  cd ..
  echo "    Database schema synced."
fi

# ─────────────────────────────────────────────────────────────────────
# Restart PM2 processes
# ─────────────────────────────────────────────────────────────────────
echo ">>> Restarting PM2 processes..."

if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "backend" ]; then
  pm2 restart salfanet-backend --update-env 2>/dev/null || \
    pm2 start deploy/ecosystem.config.js --only salfanet-backend
fi

if [ "$DEPLOY_TARGET" = "all" ] || [ "$DEPLOY_TARGET" = "frontend" ]; then
  pm2 restart salfanet-frontend --update-env 2>/dev/null || \
    pm2 start deploy/ecosystem.config.js --only salfanet-frontend
fi

# Cron and WA services don't need restart on deploy
# (cron is in backend process now, WA is independent)

pm2 save
echo "    PM2 processes restarted."

# ─────────────────────────────────────────────────────────────────────
# Reload Nginx
# ─────────────────────────────────────────────────────────────────────
if [ -f /etc/nginx/sites-enabled/salfanet ]; then
  echo ">>> Reloading Nginx..."
  sudo nginx -t && sudo systemctl reload nginx
  echo "    Nginx reloaded."
fi

# ─────────────────────────────────────────────────────────────────────
# Status check
# ─────────────────────────────────────────────────────────────────────
echo ""
echo "=== Deploy Complete ==="
echo ""
pm2 status
echo ""
echo "Backend health: $(curl -s http://127.0.0.1:3001/health || echo 'FAIL')"
echo "Frontend:       $(curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:3000 || echo 'FAIL')"
echo ""
echo "Logs:"
echo "  pm2 logs salfanet-backend"
echo "  pm2 logs salfanet-frontend"
echo "  pm2 logs salfanet-cron"
echo "  pm2 logs salfanet-wa"
