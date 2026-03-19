#!/bin/bash
# =============================================================
# Salfanet Radius - Smart Update Script
# Usage: bash scripts/update.sh [--force]
# Writes output to /tmp/salfanet-update.log
# =============================================================

APP_DIR="/var/www/salfanet-radius"
LOG_FILE="/tmp/salfanet-update.log"
PID_FILE="/tmp/salfanet-update.pid"
FORCE=${1:-""}

# Write PID for "is running" check
echo $$ > "$PID_FILE"

# Redirect all output to log file (and stdout)
exec > >(tee "$LOG_FILE") 2>&1

log()  { echo "[$(date '+%H:%M:%S')] $1"; }
ok()   { echo "[$(date '+%H:%M:%S')] ✔ $1"; }
err()  { echo "[$(date '+%H:%M:%S')] ✘ $1"; rm -f "$PID_FILE"; exit 1; }

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║      SALFANET RADIUS — UPDATE STARTED        ║"
echo "║  $(date '+%Y-%m-%d %H:%M:%S')                         ║"
echo "╚══════════════════════════════════════════════╝"
echo ""

cd "$APP_DIR" || err "Cannot cd to $APP_DIR"

# ── Current state ──────────────────────────────────────────
PREV_COMMIT=$(git rev-parse HEAD 2>/dev/null || echo "none")
PREV_SHORT=$(git rev-parse --short HEAD 2>/dev/null || echo "none")
PREV_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
log "Current version : v$PREV_VERSION ($PREV_SHORT)"

# ── Fetch from remote ─────────────────────────────────────
log "Fetching latest from GitHub..."
git fetch origin master 2>&1 || err "git fetch failed — check network or credentials"

NEW_COMMIT=$(git rev-parse origin/master)
NEW_SHORT=${NEW_COMMIT:0:7}

if [ "$PREV_COMMIT" = "$NEW_COMMIT" ] && [ "$FORCE" != "--force" ]; then
  echo ""
  ok "Already up to date (v$PREV_VERSION / $PREV_SHORT)"
  echo ""
  echo "╔══════════════════════════════════════════════╗"
  echo "║        NO UPDATE NEEDED — ALL GOOD ✔         ║"
  echo "╚══════════════════════════════════════════════╝"
  rm -f "$PID_FILE"
  exit 0
fi

# ── Show changed files ────────────────────────────────────
echo ""
log "Changed files ($PREV_SHORT → $NEW_SHORT):"
git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" 2>/dev/null | while read f; do
  echo "   • $f"
done
CHANGED=$(git diff --name-only "$PREV_COMMIT" "$NEW_COMMIT" 2>/dev/null || echo "")

# ── Apply code ────────────────────────────────────────────
echo ""
log "Applying code update..."
git reset --hard origin/master 2>&1 || err "git reset --hard failed"
ok "Code updated to $NEW_SHORT"

# ── npm install (if package.json changed OR node_modules missing) ────
if echo "$CHANGED" | grep -qE '^package\.json$|^package-lock\.json$' || [ ! -d node_modules ]; then
  echo ""
  log "package.json changed or node_modules missing — installing dependencies..."
  # Force include devDependencies for build-time tools without changing
  # global NODE_ENV for the rest of this script.
  NPM_CONFIG_PRODUCTION=false npm install --include=dev 2>&1 | tail -5
  ok "npm install done"
fi

# ── Prisma (only if schema changed) ───────────────────────
if echo "$CHANGED" | grep -q '^prisma/schema\.prisma$'; then
  echo ""
  log "Prisma schema changed — running generate + db push..."
  npx prisma generate 2>&1 | tail -3
  npx prisma db push --accept-data-loss 2>&1 | tail -5
  ok "Prisma updated"
fi

# ── Clean stale build artifacts ──────────────────────────
rm -rf .next 2>/dev/null || true

# ── Build ─────────────────────────────────────────────────
echo ""
log "Building application (this takes ~60s)..."
# Clear env vars inherited from running Next.js server that can break build
unset npm_lifecycle_event npm_lifecycle_script npm_package_name npm_package_version
unset npm_config_cache npm_config_prefix NODE_APP_INSTANCE
# Do NOT inherit NODE_OPTIONS from parent process (server may have different flags)
unset NODE_OPTIONS

npm run build > /tmp/salfanet-next-build.log 2>&1
BUILD_EXIT=$?
# Always show last 40 lines of build output in update log
tail -40 /tmp/salfanet-next-build.log
[ "$BUILD_EXIT" -ne 0 ] && err "npm run build failed (exit $BUILD_EXIT)"
ok "Build completed"

# ── Copy static assets to standalone ─────────────────────
if [ -d ".next/static" ] && [ -d ".next/standalone" ]; then
  cp -r .next/static .next/standalone/.next/static 2>/dev/null || true
  ok "Static assets copied to standalone"
fi

# ── Restart PM2 ───────────────────────────────────────────
echo ""
log "Restarting services..."
pm2 reload salfanet-radius --update-env 2>&1 | tail -3
pm2 restart salfanet-cron --update-env 2>&1 | tail -3
ok "Services reloaded (zero-downtime)"

# ── Done ──────────────────────────────────────────────────
NEW_VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "unknown")
rm -f "$PID_FILE"

echo ""
echo "╔══════════════════════════════════════════════╗"
echo "║          UPDATE COMPLETE ✔                   ║"
echo "║  v$PREV_VERSION → v$NEW_VERSION                          ║"
echo "║  $PREV_SHORT → $NEW_SHORT                           ║"
echo "║  $(date '+%Y-%m-%d %H:%M:%S')                         ║"
echo "╚══════════════════════════════════════════════╝"
