#!/bin/bash
# =============================================================
# SALFANET RADIUS — Post-Refactor Cleanup Script
# =============================================================
# Dijalankan sekali setelah update ke versi yang sudah di-refactor
# (Phase 1–8: Firebase removal, server-only, cron refactor,
#  coordinator removal, dst).
#
# Aman untuk dijalankan berkali-kali (idempotent).
# Tidak menghapus .env, database, atau konfigurasi sistem.
#
# Usage:
#   bash vps-install/cleanup-refactor.sh
#   bash vps-install/cleanup-refactor.sh --dry-run   # preview saja
# =============================================================

set -e

APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
DRY_RUN=false

# Colors
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
CYAN='\033[0;36m'; WHITE='\033[1;37m'; NC='\033[0m'

print_step()    { echo -e "\n${CYAN}▶ $1${NC}"; }
print_success() { echo -e "${GREEN}  ✔ $1${NC}"; }
print_info()    { echo -e "${YELLOW}  → $1${NC}"; }
print_skip()    { echo -e "  - $1 (not found, skip)"; }
print_removed() { echo -e "${RED}  ✘ REMOVED: $1${NC}"; }

# Parse args
for arg in "$@"; do
  case $arg in
    --dry-run) DRY_RUN=true ;;
    --app-dir=*) APP_DIR="${arg#*=}" ;;
  esac
done

if [ "$EUID" -ne 0 ]; then
  echo -e "${RED}Run as root: sudo bash vps-install/cleanup-refactor.sh${NC}"
  exit 1
fi

if [ ! -d "$APP_DIR" ]; then
  echo -e "${RED}App directory not found: $APP_DIR${NC}"
  exit 1
fi

echo ""
echo -e "${WHITE}╔══════════════════════════════════════════════════╗${NC}"
echo -e "${WHITE}║   SALFANET RADIUS — Post-Refactor Cleanup        ║${NC}"
echo -e "${WHITE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
print_info "App dir : $APP_DIR"
[ "$DRY_RUN" = true ] && echo -e "${YELLOW}  [DRY RUN — no files will be deleted]${NC}"
echo ""

remove_path() {
  local path="$1"
  local desc="${2:-$1}"
  local full="$APP_DIR/$path"
  if [ -e "$full" ] || [ -L "$full" ]; then
    if [ "$DRY_RUN" = true ]; then
      print_info "Would remove: $path"
    else
      rm -rf "$full"
      print_removed "$desc"
    fi
  else
    print_skip "$desc"
  fi
  return 0  # always succeed — set -e safe
}

# =============================================================
# PHASE 1 — Firebase / FCM removal
# =============================================================
print_step "Phase 1: Firebase / FCM cleanup"

remove_path "src/server/push.service.ts"          "Firebase push service (server)"
remove_path "src/server/push.service.js"          "Firebase push service (compiled)"
remove_path "firebase-service-account.json"       "Firebase service account credentials"
remove_path "src/lib/firebase.ts"                 "Firebase lib stub"
remove_path "src/lib/firebase-admin.ts"           "Firebase Admin lib stub"

# Uninstall firebase-admin if still installed
if [ "$DRY_RUN" = false ] && [ -d "$APP_DIR/node_modules/firebase-admin" ]; then
  print_info "Removing firebase-admin from node_modules..."
  cd "$APP_DIR" && npm uninstall firebase-admin --save 2>/dev/null || true
  print_removed "firebase-admin npm package"
elif [ -d "$APP_DIR/node_modules/firebase-admin" ]; then
  print_info "Would uninstall: firebase-admin npm package"
fi

# =============================================================
# PHASE 3 — Cron refactor (old cron-service.js structure)
# =============================================================
print_step "Phase 3: Old cron structure cleanup"

remove_path "src/lib/cron"                        "Legacy cron lib proxy (src/lib/cron/)"
# Note: cron-service.js in root is kept — it's the PM2 entrypoint fallback
# The NEW runner is src/cron/runner.ts (via ecosystem.config.js tsx)

# Update ecosystem.config.js dari production/ jika berbeda
if [ -f "$APP_DIR/production/ecosystem.config.js" ]; then
  if diff -q "$APP_DIR/production/ecosystem.config.js" "$APP_DIR/ecosystem.config.js" &>/dev/null 2>&1; then
    print_success "ecosystem.config.js already up to date"
  else
    if [ "$DRY_RUN" = true ]; then
      print_info "Would update: ecosystem.config.js (production/ → root)"
    else
      cp "$APP_DIR/production/ecosystem.config.js" "$APP_DIR/ecosystem.config.js"
      print_success "ecosystem.config.js updated (tsx runner, NODE_OPTIONS=--conditions=react-server)"
    fi
  fi
fi

# =============================================================
# PHASE 8 — Coordinator role removal
# =============================================================
print_step "Phase 8: Coordinator role cleanup"

remove_path "src/app/coordinator"                 "Coordinator portal pages"
remove_path "src/app/admin/coordinators"          "Admin coordinator management page"

# =============================================================
# ORPHAN DIRECTORIES — Removed during refactor phases 4–6
# =============================================================
print_step "Orphan directories from refactor"

# Mangled paths from old deployments (dari script lama)
for orphan in srcappadmin srcappadmininvoicesimport srcappadminisolated-users \
              srcappadminlaporan srcappadminlaporananalitik srcappadminsuspend-requests \
              srclocales; do
  remove_path "$orphan" "Orphan dir: $orphan"
done

# Refactored-away routes (sesuaikan jika masih ada dari versi lama)
STALE_ROUTES=(
  "src/app/admin/collections"
  "src/app/api/billing"
  "src/app/api/cron/history"
  "src/app/api/settings/telegram-backup"
  "src/components/dashboard"
  "INSTALLATION_INFO.txt"
  "chk-pg.js"
  "deploy.sh"
  "start-dev.ps1"
  "kill-ports.ps1"
  "bad-files.txt"
)

for stale in "${STALE_ROUTES[@]}"; do
  remove_path "$stale" "$stale"
done

# =============================================================
# ECOSYSTEM — Pastikan cron menggunakan tsx runner
# =============================================================
print_step "Verifying PM2 cron process config"

if [ "$DRY_RUN" = false ]; then
  # Cek apakah salfanet-cron masih pakai cron-service.js (old)
  CRON_SCRIPT=$(pm2 jlist 2>/dev/null | python3 -c "
import sys, json
try:
    procs = json.load(sys.stdin)
    for p in procs:
        if p.get('name') == 'salfanet-cron':
            print(p.get('pm2_env', {}).get('pm_exec_path', '') + ' ' + str(p.get('pm2_env', {}).get('args', '')))
except: pass
" 2>/dev/null || echo "")

  if echo "$CRON_SCRIPT" | grep -q "cron-service.js"; then
    print_info "salfanet-cron masih pakai cron-service.js — migrating ke tsx runner..."
    if [ -f "$APP_DIR/ecosystem.config.js" ]; then
      pm2 delete salfanet-cron 2>/dev/null || true
      cd "$APP_DIR" && pm2 start ecosystem.config.js --only salfanet-cron 2>&1 | tail -3
      pm2 save
      print_success "salfanet-cron migrated to tsx runner"
    fi
  elif echo "$CRON_SCRIPT" | grep -q "tsx\|runner"; then
    print_success "salfanet-cron already using tsx runner"
  else
    print_info "salfanet-cron status unknown — skipping migration"
  fi
fi

# =============================================================
# ENV — Pastikan dotenv ada (dibutuhkan oleh runner.ts)
# =============================================================
print_step "Checking dotenv dependency"

if [ "$DRY_RUN" = false ] && [ -d "$APP_DIR/node_modules" ]; then
  if [ ! -d "$APP_DIR/node_modules/dotenv" ]; then
    print_info "Installing dotenv (required by cron runner)..."
    cd "$APP_DIR" && npm install dotenv --save 2>&1 | tail -3
    print_success "dotenv installed"
  else
    print_success "dotenv already installed"
  fi
fi

# =============================================================
# DONE
# =============================================================
echo ""
echo -e "${WHITE}╔══════════════════════════════════════════════════╗${NC}"
if [ "$DRY_RUN" = true ]; then
  echo -e "${WHITE}║     DRY RUN COMPLETE — no files changed           ║${NC}"
else
  echo -e "${WHITE}║     CLEANUP COMPLETE ✔                            ║${NC}"
fi
echo -e "${WHITE}╚══════════════════════════════════════════════════╝${NC}"
echo ""
if [ "$DRY_RUN" = false ]; then
  echo -e "${YELLOW}  Jalankan 'pm2 list' untuk memverifikasi proses.${NC}"
  echo -e "${YELLOW}  Jalankan 'npm run build && pm2 reload salfanet-radius' jika belum rebuild.${NC}"
fi
echo ""
