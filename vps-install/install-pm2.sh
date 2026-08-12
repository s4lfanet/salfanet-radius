#!/bin/bash
# ============================================================================
# SALFANET RADIUS — PM2 Process Manager
# ============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

install_pm2() {
    print_step "PM2 Process Manager"

    if command_exists pm2; then
        print_info "PM2 already installed — skipping"
    else
        npm install -g pm2
    fi

    # Copy ecosystem config from repo
    local eco_src="$APP_DIR/deploy/ecosystem.config.js"
    if [ -f "$eco_src" ]; then
        print_info "Using ecosystem.config.js from repo"
    else
        print_warn "deploy/ecosystem.config.js not found — PM2 will use defaults"
    fi

    # Start PM2 processes (after app is built)
    start_pm2

    # Save + startup
    pm2 save 2>/dev/null || true
    local startup_cmd
    startup_cmd=$(pm2 startup systemd 2>/dev/null | grep 'sudo' | head -1)
    if [ -n "$startup_cmd" ]; then
        eval "$startup_cmd" 2>/dev/null || true
    fi

    print_success "PM2 installed and processes started"
}

start_pm2() {
    print_info "Starting PM2 processes..."

    cd "$APP_DIR" || die "App directory not found: $APP_DIR"

    if [ -f "deploy/ecosystem.config.js" ]; then
        pm2 start deploy/ecosystem.config.js \
            --update-env 2>/dev/null || pm2 start deploy/ecosystem.config.js
    else
        # Fallback: start frontend + backend manually
        pm2 start "frontend/.next/standalone/server.js" \
            --name salfanet-frontend \
            --update-env 2>/dev/null || true

        pm2 start "node dist/main.js" \
            --name salfanet-backend \
            --cwd backend \
            --update-env 2>/dev/null || true
    fi

    pm2 status
}
