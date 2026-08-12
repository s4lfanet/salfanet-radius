#!/bin/bash
# ============================================================================
# SALFANET RADIUS — VPS Updater
# ============================================================================
# Pull latest code, rebuild, restart PM2. Does NOT touch database or config.
#
# Usage:
#   bash vps-install/updater.sh              # Full update (pull + build + restart)
#   bash vps-install/updater.sh --frontend   # Only rebuild frontend
#   bash vps-install/updater.sh --backend    # Only rebuild backend
#   bash vps-install/updater.sh --migrate    # Only run Prisma migrations
# ============================================================================

set -e
set -o pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# Parse args
TARGET="all"
while [[ "$#" -gt 0 ]]; do
    case $1 in
        --frontend) TARGET="frontend"; shift ;;
        --backend)  TARGET="backend";  shift ;;
        --migrate)  TARGET="migrate";  shift ;;
        --all)      TARGET="all";      shift ;;
        --help|-h)
            echo "Usage: bash updater.sh [--frontend|--backend|--migrate|--all]"
            exit 0
            ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
    shift
done

cd "$APP_DIR" || die "App directory not found: $APP_DIR (is the app installed?)"

# ============================================================================
# PULL LATEST
# ============================================================================

if [ "$TARGET" = "all" ]; then
    print_step "Pull Latest Code"
    git pull origin "$GITHUB_BRANCH" || die "git pull failed"
    print_success "Code updated"
fi

# ============================================================================
# INSTALL DEPS (if package.json changed)
# ============================================================================

if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ] || [ "$TARGET" = "backend" ]; then
    print_step "Install Dependencies"
    pnpm install --no-frozen-lockfile || die "pnpm install failed"
    pnpm --filter @salfanet/shared-types build 2>/dev/null || true
    print_success "Dependencies ready"
fi

# ============================================================================
# MIGRATIONS
# ============================================================================

if [ "$TARGET" = "all" ] || [ "$TARGET" = "migrate" ]; then
    print_step "Run Migrations"
    cd frontend
    pnpm exec prisma generate 2>/dev/null || true
    pnpm exec prisma migrate deploy 2>/dev/null || print_warn "migrate deploy had issues"
    cd "$APP_DIR"
    print_success "Migrations applied"
fi

# ============================================================================
# BUILD
# ============================================================================

if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
    print_step "Build Backend"
    pnpm --filter backend build || die "Backend build failed"
    print_success "Backend built"
fi

if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
    print_step "Build Frontend"
    cd frontend
    NEXTAUTH_SECRET="$(grep NEXTAUTH_SECRET ../.env | cut -d'"' -f2)" \
    DATABASE_URL="$(grep DATABASE_URL ../.env | cut -d'"' -f2)" \
    pnpm run build || die "Frontend build failed"
    cd "$APP_DIR"
    print_success "Frontend built"
fi

# ============================================================================
# RESTART PM2
# ============================================================================

if [ "$TARGET" = "all" ] || [ "$TARGET" = "frontend" ]; then
    pm2 restart salfanet-frontend --update-env 2>/dev/null || print_warn "frontend not running"
fi
if [ "$TARGET" = "all" ] || [ "$TARGET" = "backend" ]; then
    pm2 restart salfanet-backend --update-env 2>/dev/null || print_warn "backend not running"
fi

sleep 2
pm2 status

echo ""
print_success "Update complete!"
echo "  Check: pm2 logs salfanet-frontend --lines 20"
echo "  Check: pm2 logs salfanet-backend --lines 20"
