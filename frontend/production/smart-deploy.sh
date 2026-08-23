#!/bin/bash

# =========================================
# SALFANET RADIUS - Smart Deploy Script
# =========================================
# Intelligent deployment that only updates what changed
#
# Usage:
#   ./smart-deploy.sh              # Auto-detect changes
#   ./smart-deploy.sh --full       # Full rebuild
#   ./smart-deploy.sh --quick      # Only restart (no rebuild)
#   ./smart-deploy.sh --rollback   # Rollback to previous version
#   ./smart-deploy.sh --status     # Show current status
# =========================================

set -e

# Configuration
APP_DIR="${APP_DIR:-/var/www/salfanet-radius}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/salfanet-radius}"
LOG_FILE="${LOG_FILE:-/var/log/salfanet-deploy.log}"
MAX_BACKUPS=5

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging
log() {
    local msg="[$(date '+%Y-%m-%d %H:%M:%S')] $1"
    echo -e "${msg}"
    echo "${msg}" >> "$LOG_FILE"
}

log_success() { log "${GREEN}✅ $1${NC}"; }
log_warning() { log "${YELLOW}⚠️  $1${NC}"; }
log_error() { log "${RED}❌ $1${NC}"; }
log_info() { log "${BLUE}ℹ️  $1${NC}"; }

# Check if running as correct user
check_user() {
    if [ "$EUID" -eq 0 ]; then
        log_warning "Running as root - consider using a dedicated user"
    fi
}

# Backup current version
create_backup() {
    log_info "Creating backup..."
    
    mkdir -p "$BACKUP_DIR"
    
    local backup_name="backup-$(date '+%Y%m%d-%H%M%S')"
    local backup_path="$BACKUP_DIR/$backup_name"

    # Backup both apps' .next output (2-app monorepo: backend + frontend)
    mkdir -p "$backup_path.next"
    cp -r "$APP_DIR/backend/.next" "$backup_path.next/backend" 2>/dev/null || true
    cp -r "$APP_DIR/frontend/.next" "$backup_path.next/frontend" 2>/dev/null || true
    git -C "$APP_DIR" rev-parse HEAD > "$backup_path.version"
    
    # Keep only last N backups
    ls -dt "$BACKUP_DIR"/backup-* 2>/dev/null | tail -n +$((MAX_BACKUPS * 2 + 1)) | xargs rm -rf 2>/dev/null || true
    
    log_success "Backup created: $backup_name"
    echo "$backup_name"
}

# Detect what changed
detect_changes() {
    cd "$APP_DIR"
    
    local changes=()
    
    # Fetch latest
    git fetch origin master --quiet
    
    # Get changed files
    local changed_files=$(git diff --name-only HEAD origin/master 2>/dev/null || echo "")
    
    if [ -z "$changed_files" ]; then
        echo "none"
        return
    fi
    
    # Check each category
    if echo "$changed_files" | grep -q "package"; then
        changes+=("deps")
    fi
    
    if echo "$changed_files" | grep -q "^prisma/schema.prisma"; then
        changes+=("prisma")
    fi
    
    if echo "$changed_files" | grep -q "^prisma/migrations"; then
        changes+=("migrations")
    fi
    
    if echo "$changed_files" | grep -q "^src/"; then
        changes+=("src")
    fi
    
    if echo "$changed_files" | grep -qE "(next.config|tsconfig)"; then
        changes+=("config")
    fi
    
    if echo "$changed_files" | grep -q "ecosystem.config"; then
        changes+=("pm2")
    fi
    
    echo "${changes[@]}"
}

# Update dependencies
# This is a pnpm workspace (backend/frontend share dependencies via
# workspace:* protocol) — npm cannot resolve that protocol at all, so this
# must use pnpm. Dev dependencies are needed too (prisma, typescript, next)
# since the build itself happens on this server.
update_dependencies() {
    log_info "Updating dependencies..."
    cd "$APP_DIR"
    pnpm install
    log_success "Dependencies updated"
}

# Generate Prisma client
# Schema lives at backend/prisma/schema.prisma, not at the repo root.
generate_prisma() {
    log_info "Generating Prisma client..."
    cd "$APP_DIR/backend"
    pnpm exec prisma generate
    log_success "Prisma client generated"
}

# Sync database schema
# This project uses `prisma db push` as its schema workflow (see
# backend/prisma/migrations — only a single baseline migration exists),
# not incremental `prisma migrate deploy`.
run_migrations() {
    log_info "Syncing database schema..."
    cd "$APP_DIR/backend"
    pnpm exec prisma db push --accept-data-loss
    log_success "Database schema synced"
}

# Build application
build_app() {
    log_info "Building application..."
    cd "$APP_DIR"

    # Stop PM2 to free memory for build
    pm2 stop all 2>/dev/null || true

    # Clean build cache (per-app — this is a 2-app monorepo, not a single .next)
    rm -rf backend/.next frontend/.next .turbo node_modules/.cache 2>/dev/null || true

    # Builds shared-types -> backend -> frontend in dependency order.
    # Each app's own build script also runs its postbuild.js, which copies
    # .env/public/static assets into .next/standalone — no manual copy needed here.
    NEXT_TELEMETRY_DISABLED=1 pnpm run build

    log_success "Build completed"
}

# Restart PM2
restart_pm2() {
    log_info "Restarting PM2 processes..."

    # NOTE: plain `pm2 reload/restart --update-env` is NOT reliable here.
    # DATABASE_URL/NEXTAUTH_SECRET are loaded by Next.js itself from each
    # app's .env file at process boot, not from ecosystem.config.js's `env`
    # block. PM2 caches a full env snapshot from the FIRST time an app was
    # registered and reinjects it on every later restart — since dotenv
    # does not override an already-set process.env value, that stale
    # snapshot silently wins over the current .env file content (verified
    # 2026-08-23: this caused a real DB-auth outage after a secret rotation
    # that a plain restart did not pick up). delete+start forces a fresh
    # registration with no cached snapshot, so the current .env is always
    # what actually gets used.
    pm2 delete salfanet-backend salfanet-frontend 2>/dev/null || true
    pm2 start "$APP_DIR/ecosystem.config.js" --only salfanet-backend,salfanet-frontend
    pm2 save

    # Wait for startup
    sleep 3

    log_success "PM2 restarted"
}

# Health check
# /api/health is served by the BACKEND app (port 3001) — the frontend app
# (port 3000) has no such route itself, so hitting :3000 directly here
# always 404s regardless of whether the deploy actually succeeded.
health_check() {
    log_info "Running health check..."

    local max_attempts=10
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
            log_success "Health check passed"
            return 0
        fi

        log_warning "Health check attempt $attempt/$max_attempts failed, retrying..."
        sleep 2
        ((attempt++))
    done

    log_error "Health check failed after $max_attempts attempts"
    return 1
}

# Rollback to previous version
rollback() {
    log_warning "Rolling back to previous version..."
    
    cd "$APP_DIR"
    
    # Get previous commit
    git reset --hard HEAD~1
    
    # Restore backup if exists (2-app monorepo: backend + frontend)
    local latest_backup=$(ls -dt "$BACKUP_DIR"/backup-*.next 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
        rm -rf backend/.next frontend/.next
        [ -d "$latest_backup/backend" ] && cp -r "$latest_backup/backend" backend/.next
        [ -d "$latest_backup/frontend" ] && cp -r "$latest_backup/frontend" frontend/.next
        log_info "Restored .next from backup"
    else
        log_warning "No backup found, rebuilding..."
        build_app
    fi
    
    restart_pm2
    
    if health_check; then
        log_success "Rollback completed successfully"
    else
        log_error "Rollback health check failed!"
        exit 1
    fi
}

# Show status
show_status() {
    echo ""
    echo "=========================================="
    echo "   SALFANET RADIUS - Deployment Status"
    echo "=========================================="
    echo ""
    
    cd "$APP_DIR"
    
    echo "📍 Current Version:"
    git log -1 --pretty=format:"   %h - %s (%cr)" 2>/dev/null || echo "   Unknown"
    echo ""
    
    echo "📦 Pending Changes:"
    local changes=$(detect_changes)
    if [ "$changes" == "none" ]; then
        echo "   No pending changes"
    else
        echo "   $changes"
    fi
    echo ""
    
    echo "⚡ PM2 Status:"
    pm2 jlist 2>/dev/null | grep -E "name|status|memory|cpu" | head -20 || echo "   PM2 not running"
    echo ""
    
    echo "🏥 Health Check:"
    if curl -sf http://localhost:3001/api/health > /dev/null 2>&1; then
        echo "   ✅ Healthy"
        curl -s http://localhost:3001/api/health | head -1
    else
        echo "   ❌ Unhealthy"
    fi
    echo ""
    
    echo "💾 Backups:"
    ls -lht "$BACKUP_DIR"/backup-*.version 2>/dev/null | head -5 || echo "   No backups found"
    echo ""
}

# Full deployment
deploy_full() {
    log_info "Starting FULL deployment..."
    
    create_backup
    
    cd "$APP_DIR"
    git fetch origin master
    git reset --hard origin/master
    
    update_dependencies
    generate_prisma
    run_migrations
    build_app
    restart_pm2
    
    if health_check; then
        log_success "Full deployment completed!"
    else
        log_error "Deployment failed! Rolling back..."
        rollback
        exit 1
    fi
}

# Incremental deployment
deploy_incremental() {
    log_info "Starting INCREMENTAL deployment..."
    
    local changes=$(detect_changes)
    
    if [ "$changes" == "none" ]; then
        log_info "No changes detected. Nothing to deploy."
        return 0
    fi
    
    log_info "Detected changes: $changes"
    
    create_backup
    
    cd "$APP_DIR"
    git fetch origin master
    git reset --hard origin/master
    
    local needs_restart=false
    local needs_build=false
    
    # Process changes in order
    if [[ "$changes" == *"deps"* ]]; then
        update_dependencies
        needs_build=true
    fi
    
    if [[ "$changes" == *"prisma"* ]]; then
        generate_prisma
        needs_build=true
    fi
    
    if [[ "$changes" == *"migrations"* ]]; then
        run_migrations
    fi
    
    if [[ "$changes" == *"src"* ]] || [[ "$changes" == *"config"* ]]; then
        needs_build=true
    fi
    
    if [ "$needs_build" = true ]; then
        build_app
    fi
    
    if [[ "$changes" == *"pm2"* ]] || [ "$needs_build" = true ]; then
        restart_pm2
    fi
    
    if health_check; then
        log_success "Incremental deployment completed!"
    else
        log_error "Deployment failed! Rolling back..."
        rollback
        exit 1
    fi
}

# Quick restart (no build)
deploy_quick() {
    log_info "Quick restart (no rebuild)..."
    
    cd "$APP_DIR"
    git fetch origin master
    git reset --hard origin/master
    
    restart_pm2
    
    if health_check; then
        log_success "Quick restart completed!"
    else
        log_error "Quick restart failed!"
        exit 1
    fi
}

# Main
main() {
    check_user
    
    case "${1:-}" in
        --full|-f)
            deploy_full
            ;;
        --quick|-q)
            deploy_quick
            ;;
        --rollback|-r)
            rollback
            ;;
        --status|-s)
            show_status
            ;;
        --help|-h)
            echo "Usage: $0 [option]"
            echo ""
            echo "Options:"
            echo "  (none)      Auto-detect and deploy changes"
            echo "  --full      Full rebuild and deploy"
            echo "  --quick     Quick restart (no rebuild)"
            echo "  --rollback  Rollback to previous version"
            echo "  --status    Show current status"
            echo "  --help      Show this help"
            ;;
        *)
            deploy_incremental
            ;;
    esac
}

main "$@"
