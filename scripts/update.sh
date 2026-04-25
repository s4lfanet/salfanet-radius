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

# If standalone server.js is missing, force a full rebuild even if code is up to date
if [ ! -f "$APP_DIR/.next/standalone/server.js" ] && [ "$FORCE" != "--force" ]; then
  log "WARNING: .next/standalone/server.js missing — forcing build even if code is up to date"
  FORCE="--force"
fi

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

# ── Ensure system dependencies (sshpass, xl2tpd) ─────────
echo ""
log "Checking system dependencies..."
MISSING_PKGS=""
for pkg in sshpass xl2tpd; do
  dpkg -s "$pkg" &>/dev/null || MISSING_PKGS="$MISSING_PKGS $pkg"
done
if [ -n "$MISSING_PKGS" ]; then
  log "Installing missing packages:$MISSING_PKGS"
  apt-get install -y $MISSING_PKGS 2>&1 | tail -5 || log "Warning: could not install$MISSING_PKGS"
else
  ok "sshpass and xl2tpd already installed"
fi

# ── Apply code ────────────────────────────────────────────
echo ""
log "Applying code update..."
git reset --hard origin/master 2>&1 || err "git reset --hard failed"
ok "Code updated to $NEW_SHORT"

# Make all scripts in scripts/ executable
chmod +x "$APP_DIR"/scripts/*.sh 2>/dev/null || true

# ── Deploy VPN / system config files (production/) ────────
echo ""
log "Checking VPN config files for changes..."
NEED_XL2TPD_RESTART=false
NEED_DAEMON_RELOAD=false

# xl2tpd.conf → /etc/xl2tpd/xl2tpd.conf
if [ -f "production/xl2tpd.conf" ]; then
  mkdir -p /etc/xl2tpd
  if ! diff -q "production/xl2tpd.conf" /etc/xl2tpd/xl2tpd.conf &>/dev/null; then
    cp "production/xl2tpd.conf" /etc/xl2tpd/xl2tpd.conf
    ok "xl2tpd.conf deployed → /etc/xl2tpd/xl2tpd.conf"
    NEED_XL2TPD_RESTART=true
  else
    log "xl2tpd.conf unchanged — skipped"
  fi
fi

# ppp options → /etc/ppp/options.l2tpd.client
if [ -f "production/ppp-options.l2tpd.client" ]; then
  if ! diff -q "production/ppp-options.l2tpd.client" /etc/ppp/options.l2tpd.client &>/dev/null; then
    cp "production/ppp-options.l2tpd.client" /etc/ppp/options.l2tpd.client
    ok "ppp options deployed → /etc/ppp/options.l2tpd.client"
    NEED_XL2TPD_RESTART=true
  else
    log "ppp options unchanged — skipped"
  fi
fi

# systemd override → /etc/systemd/system/xl2tpd.service.d/restart.conf
if [ -f "production/xl2tpd-restart.conf" ]; then
  mkdir -p /etc/systemd/system/xl2tpd.service.d
  if ! diff -q "production/xl2tpd-restart.conf" /etc/systemd/system/xl2tpd.service.d/restart.conf &>/dev/null; then
    cp "production/xl2tpd-restart.conf" /etc/systemd/system/xl2tpd.service.d/restart.conf
    ok "xl2tpd systemd override deployed"
    NEED_DAEMON_RELOAD=true
    NEED_XL2TPD_RESTART=true
  else
    log "xl2tpd systemd override unchanged — skipped"
  fi
fi

# ip-up script → /etc/ppp/ip-up.d/99-vpn-routes
if [ -f "production/99-vpn-routes" ]; then
  if ! diff -q "production/99-vpn-routes" /etc/ppp/ip-up.d/99-vpn-routes &>/dev/null; then
    cp "production/99-vpn-routes" /etc/ppp/ip-up.d/99-vpn-routes
    chmod +x /etc/ppp/ip-up.d/99-vpn-routes
    ok "99-vpn-routes deployed → /etc/ppp/ip-up.d/"
  else
    log "99-vpn-routes unchanged — skipped"
  fi
fi

# ip-down script → /etc/ppp/ip-down.d/99-vpn-routes
if [ -f "production/99-vpn-routes-ipdown" ]; then
  if ! diff -q "production/99-vpn-routes-ipdown" /etc/ppp/ip-down.d/99-vpn-routes &>/dev/null; then
    cp "production/99-vpn-routes-ipdown" /etc/ppp/ip-down.d/99-vpn-routes
    chmod +x /etc/ppp/ip-down.d/99-vpn-routes
    ok "99-vpn-routes-ipdown deployed → /etc/ppp/ip-down.d/"
  else
    log "99-vpn-routes-ipdown unchanged — skipped"
  fi
fi

# vpn-watchdog.sh → /usr/local/bin/vpn-watchdog.sh
if [ -f "vpn-watchdog.sh" ]; then
  if ! diff -q "vpn-watchdog.sh" /usr/local/bin/vpn-watchdog.sh &>/dev/null; then
    cp "vpn-watchdog.sh" /usr/local/bin/vpn-watchdog.sh
    chmod +x /usr/local/bin/vpn-watchdog.sh
    ok "vpn-watchdog.sh deployed → /usr/local/bin/"
  else
    log "vpn-watchdog.sh unchanged — skipped"
  fi
fi

# Apply systemd changes if needed
if [ "$NEED_DAEMON_RELOAD" = true ]; then
  systemctl daemon-reload
  ok "systemd daemon-reload done"
fi

# Restart xl2tpd only if config changed AND ppp0 is not currently up
# (if ppp0 is up, xl2tpd will pick up new config on next reconnect)
if [ "$NEED_XL2TPD_RESTART" = true ]; then
  if ip link show ppp0 &>/dev/null; then
    log "xl2tpd config changed but ppp0 is UP — new config takes effect on next reconnect (no restart to avoid VPN drop)"
  else
    log "xl2tpd config changed and ppp0 is DOWN — restarting xl2tpd..."
    systemctl restart xl2tpd 2>&1 | tail -3 || log "Warning: xl2tpd restart failed (non-fatal)"
    ok "xl2tpd restarted"
  fi
fi

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

# ── Prisma seed (only if seed files changed) ─────────────
if echo "$CHANGED" | grep -qE '^prisma/seeds/|^prisma/seed\.ts$'; then
  echo ""
  log "Seed files changed — running db:seed..."
  # Use stdbuf for line-buffered output so progress appears live in web log.
  if command -v stdbuf &>/dev/null; then
    stdbuf -oL npm run db:seed
    SEED_EXIT=$?
  else
    npm run db:seed
    SEED_EXIT=$?
  fi
  if [ "$SEED_EXIT" -ne 0 ]; then
    log "Warning: db:seed exited with code $SEED_EXIT (non-fatal)"
  else
    ok "Prisma seed done"
  fi
else
  ok "Seed files unchanged — skipping db:seed"
fi

# ── Clean stale build artifacts ──────────────────────────
rm -rf .next 2>/dev/null || true

# ── Migrate uploads to persistent directory ──────────────
UPLOAD_DIR="${UPLOAD_DIR:-/var/data/salfanet/uploads}"
echo ""
log "Ensuring persistent upload directory: $UPLOAD_DIR"
mkdir -p "$UPLOAD_DIR"

# Add UPLOAD_DIR to .env if not present
if [ -f "$APP_DIR/.env" ] && ! grep -q '^UPLOAD_DIR=' "$APP_DIR/.env"; then
  echo "" >> "$APP_DIR/.env"
  echo "# Persistent upload directory (survives rebuilds)" >> "$APP_DIR/.env"
  echo "UPLOAD_DIR=$UPLOAD_DIR" >> "$APP_DIR/.env"
  ok "UPLOAD_DIR added to .env"
fi

# Backfill VAPID keys for existing installs (PWA push notifications)
if [ -f "$APP_DIR/.env" ] && ! grep -q '^VAPID_PUBLIC_KEY=' "$APP_DIR/.env"; then
  WEBPUSH_BIN="$APP_DIR/node_modules/.bin/web-push"
  if [ -f "$WEBPUSH_BIN" ]; then
    VAPID_JSON=$("$WEBPUSH_BIN" generate-vapid-keys --json 2>/dev/null) || VAPID_JSON=""
    if [ -n "$VAPID_JSON" ]; then
      VAPID_PUB=$(echo "$VAPID_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['publicKey'])" 2>/dev/null) || VAPID_PUB=""
      VAPID_PRIV=$(echo "$VAPID_JSON" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['privateKey'])" 2>/dev/null) || VAPID_PRIV=""
      if [ -n "$VAPID_PUB" ] && [ -n "$VAPID_PRIV" ]; then
        printf '\n# VAPID Keys for PWA Push Notifications\nVAPID_PUBLIC_KEY="%s"\nVAPID_PRIVATE_KEY="%s"\nVAPID_CONTACT_EMAIL="admin@salfanet.local"\n' \
          "$VAPID_PUB" "$VAPID_PRIV" >> "$APP_DIR/.env"
        ok "VAPID keys generated and added to .env (PWA push notifications)"
      fi
    fi
  fi
fi

# One-time migration: move files from public/uploads/ to persistent dir
if [ -d "$APP_DIR/public/uploads" ] && [ "$(ls -A "$APP_DIR/public/uploads" 2>/dev/null)" ]; then
  MIGRATED=0
  for subdir in "$APP_DIR/public/uploads"/*/; do
    [ -d "$subdir" ] || continue
    dirname=$(basename "$subdir")
    if [ "$(ls -A "$subdir" 2>/dev/null)" ]; then
      mkdir -p "$UPLOAD_DIR/$dirname"
      # Copy only files that don't exist in destination (preserve newer)
      cp -rn "$subdir"* "$UPLOAD_DIR/$dirname/" 2>/dev/null && MIGRATED=1
    fi
  done
  if [ "$MIGRATED" = "1" ]; then
    ok "Existing uploads migrated to $UPLOAD_DIR"
  fi
fi

# ── Stop PM2 before build to free RAM (low-memory VPS) ───
echo ""
log "Stopping PM2 to free RAM before build..."
pm2 stop salfanet-radius 2>/dev/null || true
pm2 stop salfanet-cron 2>/dev/null || true
sleep 2

# ── Build ─────────────────────────────────────────────────
echo ""
log "Building application (this takes ~60s)..."
# Clear env vars inherited from running Next.js server that can break build
unset npm_lifecycle_event npm_lifecycle_script npm_package_name npm_package_version
unset npm_config_cache npm_config_prefix NODE_APP_INSTANCE
# Do NOT inherit NODE_OPTIONS from parent process (server may have different flags)
unset NODE_OPTIONS

# Use low-mem build profile (1024MB heap) — avoids OOM on 4GB VPS with PM2 running
npm run build:low-mem > /tmp/salfanet-next-build.log 2>&1
BUILD_EXIT=$?
# Always show last 40 lines of build output in update log
tail -40 /tmp/salfanet-next-build.log
[ "$BUILD_EXIT" -ne 0 ] && err "npm run build failed (exit $BUILD_EXIT)"
ok "Build completed"

# ── Copy static assets to standalone ─────────────────────
if [ -d ".next/static" ] && [ -d ".next/standalone" ]; then
  mkdir -p .next/standalone/.next/static
  cp -r .next/static/. .next/standalone/.next/static/ || err "Failed to copy static assets to standalone"
  ok "Static assets copied to standalone"
fi

# ── Copy public/ to standalone/public/ ────────────────────
if [ -d "public" ] && [ -d ".next/standalone" ]; then
  mkdir -p .next/standalone/public
  cp -r public/. .next/standalone/public/ || log "Warning: failed to copy public/ to standalone"
  ok "public/ copied to standalone"
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
