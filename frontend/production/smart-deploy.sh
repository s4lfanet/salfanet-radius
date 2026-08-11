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
    
    # Backup .next and node_modules hash
    cp -r "$APP_DIR/.next" "$backup_path.next" 2>/dev/null || true
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
update_dependencies() {
    log_info "Updating dependencies..."
    cd "$APP_DIR"
    npm ci --production
    log_success "Dependencies updated"
}

# Generate Prisma client
generate_prisma() {
    log_info "Generating Prisma client..."
    cd "$APP_DIR"
    npx prisma generate
    log_success "Prisma client generated"
}

# Run migrations
run_migrations() {
    log_info "Running database migrations..."
    cd "$APP_DIR"
    npx prisma migrate deploy
    log_success "Migrations completed"
}

# Build application
build_app() {
    log_info "Building application..."
    cd "$APP_DIR"
    
    # Stop PM2 to free memory for build
    pm2 stop all 2>/dev/null || true
    sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    
    # Clean build cache
    rm -rf .next .turbo node_modules/.cache 2>/dev/null || true
    
    # Use optimized VPS build command (1.5GB heap limit)
    NEXT_TELEMETRY_DISABLED=1 npm run build:vps
    
    log_success "Build completed"
}

# Restart PM2
restart_pm2() {
    log_info "Restarting PM2 processes..."
    
    # Zero-downtime reload
    pm2 reload ecosystem.config.js --update-env
    
    # Wait for startup
    sleep 3
    
    log_success "PM2 restarted"
}

# Health check
health_check() {
    log_info "Running health check..."
    
    local max_attempts=10
    local attempt=1
    
    while [ $attempt -le $max_attempts ]; do
        if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
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
    
    # Restore backup if exists
    local latest_backup=$(ls -dt "$BACKUP_DIR"/backup-*.next 2>/dev/null | head -1)
    if [ -n "$latest_backup" ]; then
        rm -rf .next
        cp -r "$latest_backup" .next
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
    if curl -sf http://localhost:3000/api/health > /dev/null 2>&1; then
        echo "   ✅ Healthy"
        curl -s http://localhost:3000/api/health | head -1
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
