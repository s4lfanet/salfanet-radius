#!/bin/bash
# ============================================================================
# SALFANET RADIUS VPS Installer - PM2 & Build Module
# ============================================================================
# Step 7: Install PM2, build application, start with PM2
# ============================================================================

# Source common functions
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
source "$SCRIPT_DIR/common.sh"

# ============================================================================
# PM2 INSTALLATION
# ============================================================================

fix_node_permissions() {
    print_info "Fixing Node.js execution permissions for ${APP_USER}..."
    
    # Set executable permissions on Node.js binaries
    chmod 755 /usr/bin/node 2>/dev/null || true
    chmod 755 /usr/bin/npm 2>/dev/null || true
    chmod 755 /usr/bin/npx 2>/dev/null || true
    
    # If npm is a symlink, fix the target too
    if [ -L "/usr/bin/npm" ]; then
        NPM_TARGET=$(readlink -f /usr/bin/npm)
        chmod 755 "$NPM_TARGET" 2>/dev/null || true
    fi
    
    # Fix PM2 binary and modules
    chmod 755 /usr/bin/pm2 2>/dev/null || true
    chmod -R 755 /usr/lib/node_modules/pm2 2>/dev/null || true
    
    # Test if user can execute node using su -
    if sudo su - ${APP_USER} -c 'node --version' &>/dev/null; then
        print_success "Node.js executable by ${APP_USER}"
    else
        print_warning "Node.js test failed, but continuing..."
    fi
}

install_pm2() {
    print_info "Installing PM2 globally..."
    
    npm install -g pm2 || {
        print_error "Failed to install PM2"
        return 1
    }
    
    print_success "PM2 installed: $(pm2 --version)"
    
    # Fix Node.js permissions BEFORE configuring PM2
    fix_node_permissions
    
    # Setup PM2 for app user
    print_info "Configuring PM2 for user: ${APP_USER}..."
    
    # Create PM2 directories for app user
    mkdir -p /home/${APP_USER}/.pm2/logs
    mkdir -p /home/${APP_USER}/.pm2/pids
    chown -R ${APP_USER}:${APP_GROUP} /home/${APP_USER}/.pm2
    
    # Fix PM2 binary permission too
    chmod 755 /usr/bin/pm2 2>/dev/null || true
    if [ -L "/usr/bin/pm2" ]; then
        PM2_TARGET=$(readlink -f /usr/bin/pm2)
        chmod 755 "$PM2_TARGET" 2>/dev/null || true
    fi
    
    print_success "PM2 configured for ${APP_USER}"
}

# ============================================================================
# SWAP CONFIGURATION
# ============================================================================

check_and_create_swap() {
    print_info "Checking memory and swap..."
    
    local TOTAL_MEM=$(free -m | awk 'NR==2{printf "%s", $2}')
    local AVAILABLE_MEM=$(free -m | awk 'NR==2{printf "%s", $7}')
    
    print_info "System memory: ${TOTAL_MEM}MB total, ${AVAILABLE_MEM}MB available"
    
    if [ "$TOTAL_MEM" -lt "3000" ]; then
        print_warning "Low memory system detected (< 3GB RAM) — creating swap for build safety"
        
        if [ ! -f /swapfile ]; then
            print_info "Creating 2GB swap file (one-time setup, 2-3 minutes)..."
            
            dd if=/dev/zero of=/swapfile bs=1M count=2048 status=progress 2>&1 | grep -v "records"
            chmod 600 /swapfile
            mkswap /swapfile
            swapon /swapfile
            echo '/swapfile none swap sw 0 0' >> /etc/fstab
            
            print_success "Swap file created and activated"
            free -h
        else
            print_success "Swap file already exists"
            swapon /swapfile 2>/dev/null || true
        fi
    else
        print_success "Sufficient memory available"
    fi
}

# ============================================================================
# APPLICATION BUILD
# ============================================================================

build_application() {
    print_step "Building Next.js applications (frontend + backend, 5-10 minutes)"
    
    cd ${APP_DIR} || {
        print_error "Failed to change to ${APP_DIR}"
        return 1
    }
    
    # Verify prerequisites
    if [ ! -d "frontend/node_modules" ] || [ ! -d "backend/node_modules" ]; then
        print_error "node_modules not found in frontend/ or backend/! Run install-app.sh first"
        return 1
    fi
    
    # Clean previous builds
    print_info "Cleaning previous build artifacts..."
    rm -rf frontend/.next frontend/.turbo frontend/node_modules/.cache 2>/dev/null || true
    rm -rf backend/.next backend/.turbo backend/node_modules/.cache 2>/dev/null || true
    print_success "Build cache cleared"
    
    # Free memory before build (critical for 2GB RAM VPS)
    print_info "Freeing memory before build..."
    pm2 stop all 2>/dev/null || true
    sync && echo 3 > /proc/sys/vm/drop_caches 2>/dev/null || true
    local FREE_MEM=$(free -m | awk 'NR==2{printf "%s", $7}')
    print_info "Available memory: ${FREE_MEM}MB"
    
    # -----------------------------------------------------------------------
    # Build BACKEND (API routes + Prisma + services) — port 3001
    # -----------------------------------------------------------------------
    print_info "Starting backend Next.js build (API + Prisma)..."
    print_info "Building with Node.js memory limit: 1.5GB"
    echo ""
    
    if ( cd ${APP_DIR}/backend && \
         npx prisma generate && \
         NEXT_TELEMETRY_DISABLED=1 PRISMA_HIDE_UPDATE_MESSAGE=true \
         NODE_OPTIONS='--max-old-space-size=1536' npx next build ) 2>&1 | tee /tmp/build-backend.log; then
        print_success "Backend build completed successfully!"
    else
        print_error "Backend build failed!"
        echo ""
        print_info "Build error details:"
        echo "=========================================="
        grep -i "error" /tmp/build-backend.log | tail -20 || tail -30 /tmp/build-backend.log
        echo "=========================================="
        echo ""
        print_info "Common solutions:"
        echo "  1. Ensure you have enough memory/swap"
        echo "  2. Check full log: cat /tmp/build-backend.log"
        echo "  3. Try manual build: cd ${APP_DIR}/backend && npx prisma generate && NODE_OPTIONS='--max-old-space-size=1536' npx next build"
        return 1
    fi
    
    # Verify backend build output
    if [ ! -d "${APP_DIR}/backend/.next" ]; then
        print_error "backend/.next directory not created! Build may have failed."
        return 1
    fi
    print_success "backend/.next build directory verified"

    # -----------------------------------------------------------------------
    # REQUIRED for Next.js standalone mode (monorepo): copy public/ and
    # .next/static/ into .next/standalone/backend/ so the standalone
    # server.js can serve them. Without this, static assets 404.
    # See: https://nextjs.org/docs/app/api-reference/next-config-js/output#automatically-copying-traced-files
    # -----------------------------------------------------------------------
    if [ -d "${APP_DIR}/backend/.next/standalone" ]; then
        print_info "Copying backend public assets into standalone bundle..."

        if [ -d "${APP_DIR}/backend/public" ]; then
            mkdir -p ${APP_DIR}/backend/.next/standalone/backend/public
            cp -r ${APP_DIR}/backend/public/. ${APP_DIR}/backend/.next/standalone/backend/public/
            print_success "backend/public copied → .next/standalone/backend/public/"
        fi

        if [ -d "${APP_DIR}/backend/.next/static" ]; then
            mkdir -p ${APP_DIR}/backend/.next/standalone/backend/.next
            cp -r ${APP_DIR}/backend/.next/static ${APP_DIR}/backend/.next/standalone/backend/.next/static/
            print_success "backend/.next/static copied → .next/standalone/backend/.next/static/"
        fi

        # Copy .env into standalone dir so the standalone server picks it up
        if [ -f "${APP_DIR}/backend/.env" ]; then
            cp ${APP_DIR}/backend/.env ${APP_DIR}/backend/.next/standalone/backend/.env
            print_success "backend/.env copied → .next/standalone/backend/.env"
        fi
    else
        print_warning "backend/.next/standalone not found — skipping asset copy (non-standalone build?)"
    fi

    # -----------------------------------------------------------------------
    # Build FRONTEND (UI + NextAuth routes) — port 3000
    # -----------------------------------------------------------------------
    print_info "Starting frontend Next.js build (UI + NextAuth)..."
    print_info "Building with Node.js memory limit: 1.5GB"
    echo ""
    
    if ( cd ${APP_DIR}/frontend && \
         NEXT_TELEMETRY_DISABLED=1 \
         NODE_OPTIONS='--max-old-space-size=1536' npx next build ) 2>&1 | tee /tmp/build-frontend.log; then
        print_success "Frontend build completed successfully!"
    else
        print_error "Frontend build failed!"
        echo ""
        print_info "Build error details:"
        echo "=========================================="
        grep -i "error" /tmp/build-frontend.log | tail -20 || tail -30 /tmp/build-frontend.log
        echo "=========================================="
        echo ""
        print_info "Common solutions:"
        echo "  1. Ensure you have enough memory/swap"
        echo "  2. Check full log: cat /tmp/build-frontend.log"
        echo "  3. Try manual build: cd ${APP_DIR}/frontend && NODE_OPTIONS='--max-old-space-size=1536' npx next build"
        return 1
    fi
    
    # Verify frontend build output
    if [ ! -d "${APP_DIR}/frontend/.next" ]; then
        print_error "frontend/.next directory not created! Build may have failed."
        return 1
    fi
    print_success "frontend/.next build directory verified"

    # -----------------------------------------------------------------------
    # REQUIRED for Next.js standalone mode (monorepo): copy public/ and
    # .next/static/ into .next/standalone/frontend/ so the standalone
    # server.js can serve them. Without this, PWA manifests, sw.js, and
    # all static assets 404.
    # -----------------------------------------------------------------------
    if [ -d "${APP_DIR}/frontend/.next/standalone" ]; then
        print_info "Copying frontend public assets into standalone bundle..."

        if [ -d "${APP_DIR}/frontend/public" ]; then
            mkdir -p ${APP_DIR}/frontend/.next/standalone/frontend/public
            cp -r ${APP_DIR}/frontend/public/. ${APP_DIR}/frontend/.next/standalone/frontend/public/
            print_success "frontend/public copied → .next/standalone/frontend/public/"
        fi

        if [ -d "${APP_DIR}/frontend/.next/static" ]; then
            mkdir -p ${APP_DIR}/frontend/.next/standalone/frontend/.next
            cp -r ${APP_DIR}/frontend/.next/static ${APP_DIR}/frontend/.next/standalone/frontend/.next/static/
            print_success "frontend/.next/static copied → .next/standalone/frontend/.next/static/"
        fi

        # Copy .env into standalone dir so the standalone server picks it up
        if [ -f "${APP_DIR}/frontend/.env" ]; then
            cp ${APP_DIR}/frontend/.env ${APP_DIR}/frontend/.next/standalone/frontend/.env
            print_success "frontend/.env copied → .next/standalone/frontend/.env"
        fi
    else
        print_warning "frontend/.next/standalone not found — skipping asset copy (non-standalone build?)"
    fi
}

# ============================================================================
# PM2 CONFIGURATION
# ============================================================================

create_pm2_config() {
    print_info "Creating PM2 ecosystem file..."

    # Prefer the production-tuned config shipped with the app
    if [ -f "${APP_DIR}/production/ecosystem.config.js" ]; then
        cp "${APP_DIR}/production/ecosystem.config.js" "${APP_DIR}/ecosystem.config.js"
        print_success "PM2 ecosystem file copied from production/ecosystem.config.js"
    else
        # Fallback: generate a complete config with all required services
        print_info "production/ecosystem.config.js not found, generating fallback..."
        cat > ${APP_DIR}/ecosystem.config.js <<'EOF'
const APP_DIR = process.env.APP_DIR || '/var/www/salfanet-radius';
module.exports = {
  apps: [
    {
      name: 'salfanet-frontend',
      script: 'frontend/.next/standalone/frontend/server.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '450M',
      node_args: ['--max-old-space-size=400','--max-semi-space-size=8','--optimize-for-size'],
      env: { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=400', PORT: 3000, HOSTNAME: '127.0.0.1', TZ: 'Asia/Jakarta' },
      error_file: './logs/frontend-error.log',
      out_file: './logs/frontend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 */6 * * *'
    },
    {
      name: 'salfanet-backend',
      script: 'backend/.next/standalone/backend/server.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'cluster',
      watch: false,
      max_memory_restart: '450M',
      node_args: ['--max-old-space-size=400','--max-semi-space-size=8','--optimize-for-size'],
      env: { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=400', PORT: 3001, HOSTNAME: '127.0.0.1', TZ: 'Asia/Jakarta' },
      error_file: './logs/backend-error.log',
      out_file: './logs/backend-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '10s',
      cron_restart: '0 */6 * * *'
    },
    {
      name: 'salfanet-cron',
      // tsx CLI binary directly -- runner-wrapper.cjs's require('tsx/cjs') hook does
      // NOT apply tsconfig path aliases (@/*), causing ERR_MODULE_NOT_FOUND.
      script: 'backend/node_modules/.bin/tsx',
      args: ['backend/cron-runner.ts'],
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '150M',
      node_args: ['--max-old-space-size=120','--max-semi-space-size=4','--optimize-for-size'],
      env: { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=120', TZ: 'Asia/Jakarta' },
      error_file: './logs/cron-error.log',
      out_file: './logs/cron-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 5,
      min_uptime: '10s',
      restart_delay: 5000
    },
    {
      name: 'salfanet-wa',
      script: './backend/wa-service.js',
      cwd: APP_DIR,
      instances: 1,
      exec_mode: 'fork',
      watch: false,
      max_memory_restart: '200M',
      node_args: ['--max-old-space-size=180','--max-semi-space-size=4'],
      env: { NODE_ENV: 'production', NODE_OPTIONS: '--max-old-space-size=180', WA_SERVICE_PORT: 4000, WA_AUTH_DIR: '/var/data/salfanet/baileys_auth', TZ: 'Asia/Jakarta' },
      error_file: './logs/wa-error.log',
      out_file: './logs/wa-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      autorestart: true,
      max_restarts: 10,
      min_uptime: '5s',
      restart_delay: 3000
    }
  ]
};
EOF
        print_success "PM2 ecosystem file generated (fallback)"
    fi

    mkdir -p ${APP_DIR}/logs
    print_success "PM2 ecosystem configured (salfanet-frontend + salfanet-backend + salfanet-cron + salfanet-wa)"
}

check_port_conflict() {
    print_info "Checking for port conflicts on ports 3000 (frontend) and 3001 (backend)..."
    
    local CONFLICT_FOUND=0

    for PORT in 3000 3001; do
        local PORT_CHECK=$(lsof -ti:${PORT} 2>/dev/null || netstat -tlnp 2>/dev/null | grep :${PORT} | awk '{print $7}' | cut -d'/' -f1)
        
        if [ -n "$PORT_CHECK" ]; then
            print_warning "Port ${PORT} is already in use by PID(s): $PORT_CHECK"
            
            # Show process details
            echo ""
            print_info "Process details:"
            ps aux | grep -E "$PORT_CHECK|PID" | grep -v grep
            echo ""
            
            read -p "Kill conflicting processes on port ${PORT}? [Y/n]: " KILL_CONFIRM
            if [[ ! "$KILL_CONFIRM" =~ ^[Nn]$ ]]; then
                kill_conflicting_processes ${PORT}
            else
                print_error "Cannot start application with port ${PORT} in use"
                print_info "Please manually kill the process or change the application port"
                return 1
            fi
        else
            print_success "Port ${PORT} is available"
        fi
    done
}

kill_conflicting_processes() {
    local PORT=${1:-3000}
    print_info "Killing processes using port ${PORT}..."
    
    # Get all PIDs using port ${PORT}
    local PIDS=$(lsof -ti:${PORT} 2>/dev/null)
    
    if [ -z "$PIDS" ]; then
        # Try netstat method
        PIDS=$(netstat -tlnp 2>/dev/null | grep :${PORT} | awk '{print $7}' | cut -d'/' -f1 | grep -v '-')
    fi
    
    if [ -n "$PIDS" ]; then
        for PID in $PIDS; do
            print_info "Killing PID $PID..."
            
            # Force kill immediately with sudo (no graceful kill during install)
            kill -9 $PID 2>/dev/null || sudo kill -9 $PID 2>/dev/null || true
        done
        
        # Verify port is free
        sleep 2
        if lsof -ti:${PORT} >/dev/null 2>&1 || netstat -tlnp 2>/dev/null | grep -q :${PORT}; then
            print_error "Failed to free port ${PORT}!"
            print_info "Try manually: sudo lsof -ti:${PORT} | xargs sudo kill -9"
            return 1
        else
            print_success "Port ${PORT} is now free"
        fi
    else
        print_success "No processes to kill on port ${PORT}"
    fi
}

cleanup_pm2_processes() {
    print_info "Cleaning up old PM2 processes..."
    
    # Kill any processes on ports 3000 (frontend) and 3001 (backend) first
    print_info "Ensuring ports 3000 and 3001 are free..."
    lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    lsof -ti:3001 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    
    # Cleanup root PM2 processes
    pm2 delete all 2>/dev/null || true
    pm2 delete salfanet-frontend 2>/dev/null || true
    pm2 delete salfanet-backend 2>/dev/null || true
    pm2 delete salfanet-cron 2>/dev/null || true
    pm2 delete salfanet-radius 2>/dev/null || true
    pm2 kill 2>/dev/null || true

    # Remove stale root PM2 dump so old processes don't resurrect on reboot
    rm -f /root/.pm2/dump.pm2 /root/.pm2/dump.pm2.bak 2>/dev/null || true

    # Cleanup app user PM2 processes using su - for proper environment
    sudo su - ${APP_USER} -c 'pm2 delete all 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 delete salfanet-frontend 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 delete salfanet-backend 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 delete salfanet-cron 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 delete salfanet-radius 2>/dev/null || true'
    sudo su - ${APP_USER} -c 'pm2 kill 2>/dev/null || true'

    # Remove stale PM2 dumps for app user as well
    sudo su - ${APP_USER} -c 'rm -f ~/.pm2/dump.pm2 ~/.pm2/dump.pm2.bak 2>/dev/null || true'

    # Stop root PM2 startup service if app should run as non-root to avoid duplicate resurrection
    if [ -n "${APP_USER}" ] && [ "${APP_USER}" != "root" ]; then
        systemctl stop pm2-root 2>/dev/null || true
        systemctl disable pm2-root 2>/dev/null || true
    fi
    
    # Kill any Node processes that might be lingering
    pkill -9 -f "node.*next-server" 2>/dev/null || true
    pkill -9 -f "PM2.*salfanet" 2>/dev/null || true
    pkill -9 -f "/root/salfanet-radius" 2>/dev/null || true
    pkill -9 -f "/home/.*/salfanet-radius" 2>/dev/null || true
    pkill -9 -f "/var/www/salfanet-radius" 2>/dev/null || true
    
    # Final check on ports 3000 and 3001
    lsof -ti:3000 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    lsof -ti:3001 2>/dev/null | xargs -r kill -9 2>/dev/null || true
    
    # Wait for cleanup
    sleep 2

    # Best-effort visibility for troubleshooting duplicate instances
    print_info "Remaining salfanet-related processes after cleanup:"
    ps -ef | grep -i salfanet | grep -v grep || true
    
    print_success "PM2 processes cleaned"
}

start_pm2_app() {
    print_info "Starting applications (frontend + backend + cron) with PM2 as user: ${APP_USER}..."
    
    cd ${APP_DIR} || return 1
    
    # Ensure ownership is correct
    chown -R ${APP_USER}:${APP_GROUP} ${APP_DIR}
    
    # Check and fix port conflicts
    check_port_conflict || return 1
    
    # Cleanup old PM2 processes
    cleanup_pm2_processes
    
    # Start all apps with PM2 as app user using su - for proper environment
    print_info "Launching applications (frontend + backend + cron) as ${APP_USER}..."
    if ! sudo su - ${APP_USER} -c "cd ${APP_DIR} && pm2 start ecosystem.config.js" 2>&1 | tee /tmp/pm2-start.log; then
        print_error "PM2 start failed!"
        cat /tmp/pm2-start.log
        return 1
    fi

    # Validate app cwd points to the intended APP_DIR only
    print_info "Verifying PM2 working directories..."
    sudo su - ${APP_USER} -c 'pm2 jlist' 2>/dev/null | grep -E '"name"|"pm_cwd"' || true
    
    # Save PM2 configuration for app user
    sudo su - ${APP_USER} -c 'pm2 save'
    
    # Setup PM2 startup for app user
    print_info "Configuring PM2 startup for ${APP_USER}..."
    
    # Handle root user or empty user: pm2 startup without -u/--hp flags
    if [ -z "${APP_USER}" ] || [ "${APP_USER}" = "root" ]; then
        # Running as root - use standard startup without user flags
        env PATH=$PATH:/usr/bin /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u root --hp /root || \
        pm2 startup systemd || true
    else
        # Dedicated user - pass user and home path
        sudo /usr/lib/node_modules/pm2/bin/pm2 startup systemd -u ${APP_USER} --hp /home/${APP_USER} || true
    fi
    
    # Wait for apps to stabilize
    print_info "Waiting for applications to stabilize..."
    sleep 5

    # ── Start Baileys WhatsApp service ────────────────────────────────────
    print_info "Starting salfanet-wa (Baileys WhatsApp service)..."
    mkdir -p /var/data/salfanet/baileys_auth
    if [ -f "${APP_DIR}/backend/wa-service.js" ]; then
        if sudo su - ${APP_USER} -c "cd ${APP_DIR} && pm2 describe salfanet-wa" &>/dev/null; then
            sudo su - ${APP_USER} -c "pm2 restart salfanet-wa --update-env" 2>/dev/null || true
        else
            sudo su - ${APP_USER} -c "cd ${APP_DIR} && pm2 start ecosystem.config.js --only salfanet-wa" 2>&1 | tail -3 || true
        fi
        print_success "salfanet-wa started"
    else
        print_warning "backend/wa-service.js not found — skipping salfanet-wa startup"
    fi

    # Save updated PM2 config (includes salfanet-wa)
    sudo su - ${APP_USER} -c 'pm2 save'

    # Check if apps are running using su -
    if sudo su - ${APP_USER} -c 'pm2 list' | grep -qE "salfanet-frontend.*online|salfanet-backend.*online"; then
        print_success "Applications started successfully!"
        echo ""
        print_info "Application status:"
        sudo su - ${APP_USER} -c 'pm2 list'
        echo ""
        print_info "Application URLs:"
        echo "  Frontend: http://${VPS_IP} (via Nginx port 80)"
        echo "  Backend API: http://127.0.0.1:3001 (internal)"
        echo "  Cron Service: Running in background"
        echo "  WhatsApp Service: Running in background"
        echo ""
        print_info "Monitor logs:"
        echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-frontend'"
        echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-backend'"
        echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-cron'"
        echo ""
        print_info "Restart apps:"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart salfanet-frontend'"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart salfanet-backend'"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart all'"
    else
        print_error "Applications failed to start!"
        echo ""
        print_info "Recent logs:"
        sudo su - ${APP_USER} -c 'pm2 logs --lines 30 --nostream'
        echo ""
        print_info "Troubleshooting commands:"
        echo "  sudo su - ${APP_USER} -c 'pm2 logs'"
        echo "  sudo su - ${APP_USER} -c 'pm2 restart all'"
        echo "  lsof -i:3000"
        echo "  lsof -i:3001"
        return 1
    fi
}

start_cron_service() {
    print_info "Cron service will be started via ecosystem.config.js"
    
    # Check if the tsx cron runner exists
    if [ ! -f "${APP_DIR}/backend/cron-runner.ts" ]; then
        print_warning "backend/cron-runner.ts not found (cron service will be skipped)"
        return 0
    fi
    
    print_success "Cron service configured in ecosystem.config.js (tsx runner)"
}

run_post_install_fixes() {
    print_step "Running post-installation fixes"
    
    cd ${APP_DIR}/backend || return 1
    
    # Fix emoji encoding
    if [ -f "prisma/seeds/fix-emoji.js" ]; then
        print_info "Fixing emoji encoding..."
        node prisma/seeds/fix-emoji.js && print_success "Emoji template fixed" || print_warning "Failed to fix emoji"
    fi
    
    # Seed notification templates
    if [ -f "prisma/seeds/seed-templates.js" ]; then
        print_info "Seeding notification templates..."
        node prisma/seeds/seed-templates.js && print_success "Notification templates seeded" || print_warning "Failed to seed templates"
    fi
    
    # Update voucher template
    if [ -f "prisma/seeds/seed-voucher.js" ]; then
        print_info "Updating voucher template..."
        node prisma/seeds/seed-voucher.js && print_success "Voucher template updated" || print_warning "Failed to update voucher"
    fi
    
    # Enable FreeRADIUS REST module now that app is running
    print_info "Enabling FreeRADIUS REST module..."
    local FR_CONFIG_DIR="/etc/freeradius/3.0"
    if [ ! -d "$FR_CONFIG_DIR" ]; then
        FR_CONFIG_DIR="/etc/freeradius"
    fi
    
    if [ -f "${FR_CONFIG_DIR}/mods-available/rest" ]; then
        ln -sf ${FR_CONFIG_DIR}/mods-available/rest ${FR_CONFIG_DIR}/mods-enabled/rest
        print_info "Restarting FreeRADIUS to apply REST module..."
        systemctl restart freeradius 2>/dev/null && print_success "FreeRADIUS REST module enabled" || print_warning "Failed to restart FreeRADIUS"
    fi
    
    print_success "Post-installation fixes completed"
}

create_deployment_script() {
    print_info "Creating deployment script..."
    
    cat > ${APP_DIR}/deploy.sh <<'EOFSCRIPT'
#!/bin/bash
set -e

echo "[*] Deploying SALFANET RADIUS..."

APP_DIR="/var/www/salfanet-radius"
APP_USER="$(stat -c '%U' "$APP_DIR" 2>/dev/null || echo salfanet)"
SOURCE_DIR=""
DEFAULT_BRANCH=""

# Check if running as root
if [ "$EUID" -ne 0 ]; then 
    echo "[ERROR] This script must be run as root"
    echo "Run with: sudo $0"
    exit 1
fi

for candidate in "$APP_DIR" "/root/salfanet-radius" "/root/SALFANET-RADIUS-main"; do
    if [ -f "$candidate/package.json" ]; then
        SOURCE_DIR="$candidate"
        break
    fi
done

if [ -z "$SOURCE_DIR" ]; then
    echo "[ERROR] Source directory not found"
    exit 1
fi

echo ">> Source directory: $SOURCE_DIR"
echo ">> Active directory: $APP_DIR"

# Pull latest code from source repo if available
if [ -d "$SOURCE_DIR/.git" ]; then
    echo ">> Pulling latest code from git source..."
    DEFAULT_BRANCH=$(git -C "$SOURCE_DIR" symbolic-ref --short refs/remotes/origin/HEAD 2>/dev/null | sed 's#^origin/##')

    if [ -z "$DEFAULT_BRANCH" ]; then
        if git -C "$SOURCE_DIR" show-ref --verify --quiet refs/heads/master; then
            DEFAULT_BRANCH="master"
        elif git -C "$SOURCE_DIR" show-ref --verify --quiet refs/heads/main; then
            DEFAULT_BRANCH="main"
        else
            DEFAULT_BRANCH="master"
        fi
    fi

    git -C "$SOURCE_DIR" fetch origin
    git -C "$SOURCE_DIR" checkout "$DEFAULT_BRANCH"
    git -C "$SOURCE_DIR" pull --ff-only origin "$DEFAULT_BRANCH"
fi

# Sync latest source into active app dir when source repo is separate
if [ "$SOURCE_DIR" != "$APP_DIR" ]; then
    echo ">> Syncing source into active app directory..."
    if command -v rsync >/dev/null 2>&1; then
        rsync -a --delete \
            --exclude='.git' \
            --exclude='node_modules' \
            --exclude='.next' \
            --exclude='logs' \
            "$SOURCE_DIR/" "$APP_DIR/"
    else
        cp -a "$SOURCE_DIR/." "$APP_DIR/"
    fi
fi

cd ${APP_DIR}

# Install dependencies (frontend + backend)
echo ">> Installing dependencies..."
( cd frontend && npm install --production=false )
( cd backend && npm install --production=false )

# Generate Prisma Client (backend)
echo "[>] Generating Prisma Client..."
( cd backend && node_modules/.bin/prisma generate )

# Push database schema (backend)
echo "[>] Updating database schema..."
( cd backend && node_modules/.bin/prisma db push --accept-data-loss )

# Build backend application (API routes + Prisma + services)
echo "[>] Building backend application..."
( cd backend && NODE_OPTIONS="--max-old-space-size=1536" npx next build )

# Copy backend public assets into standalone bundle (required for static assets)
if [ -d "backend/.next/standalone" ]; then
    echo "[>] Copying backend public assets into standalone bundle..."
    [ -d "backend/public" ] && { mkdir -p backend/.next/standalone/backend/public; cp -r backend/public/. backend/.next/standalone/backend/public/; } || true
    if [ -d "backend/.next/static" ]; then
        mkdir -p backend/.next/standalone/backend/.next
        cp -r backend/.next/static backend/.next/standalone/backend/.next/static/ || true
    fi
    [ -f "backend/.env" ] && cp backend/.env backend/.next/standalone/backend/.env || true
    echo "[OK] Backend standalone assets copied"
fi

# Build frontend application (UI + NextAuth routes)
echo "[>] Building frontend application..."
( cd frontend && NODE_OPTIONS="--max-old-space-size=1536" npx next build )

# Copy frontend public assets into standalone bundle (required for PWA manifests + sw.js)
if [ -d "frontend/.next/standalone" ]; then
    echo "[>] Copying frontend public assets into standalone bundle..."
    [ -d "frontend/public" ] && { mkdir -p frontend/.next/standalone/frontend/public; cp -r frontend/public/. frontend/.next/standalone/frontend/public/; } || true
    if [ -d "frontend/.next/static" ]; then
        mkdir -p frontend/.next/standalone/frontend/.next
        cp -r frontend/.next/static frontend/.next/standalone/frontend/.next/static/ || true
    fi
    [ -f "frontend/.env" ] && cp frontend/.env frontend/.next/standalone/frontend/.env || true
    echo "[OK] Frontend standalone assets copied"
fi

# Fix ownership
echo "[>] Fixing permissions..."
chown -R ${APP_USER}:${APP_USER} ${APP_DIR}

# Refresh ecosystem.config.js from production/ (rsync --delete erases root copy)
if [ -f "${APP_DIR}/production/ecosystem.config.js" ]; then
    cp "${APP_DIR}/production/ecosystem.config.js" "${APP_DIR}/ecosystem.config.js"
    echo "[>] ecosystem.config.js refreshed from production/"
fi

# Restart PM2 as salfanet user
echo "[>] Restarting application..."
sudo su - ${APP_USER} -c "cd ${APP_DIR} && pm2 reload ecosystem.config.js --update-env || pm2 start ${APP_DIR}/ecosystem.config.js"
sudo su - ${APP_USER} -c 'pm2 save'

echo "[OK] Deployment completed!"
echo ">> Note: PM2 runs 4 processes: salfanet-frontend, salfanet-backend, salfanet-cron, salfanet-wa."
echo ""
echo ">> Application status:"
sudo su - ${APP_USER} -c 'pm2 list'
EOFSCRIPT

    chmod +x ${APP_DIR}/deploy.sh
    print_success "Deployment script created: ${APP_DIR}/deploy.sh"
}

install_pm2_and_build() {
    print_step "Step 7: Install PM2, Build & Start Application"
    
    install_pm2
    check_and_create_swap
    create_pm2_config
    build_application
    start_pm2_app
    start_cron_service
    run_post_install_fixes
    create_deployment_script
    
    print_success "PM2 installation and application deployment completed"
    
    echo ""
    print_info "Application Status (as ${APP_USER}):"
    sudo su - ${APP_USER} -c 'pm2 list'
    echo ""
    print_info "View logs:"
    echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-frontend'"
    echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-backend'"
    echo "  sudo su - ${APP_USER} -c 'pm2 logs salfanet-cron'"
    echo ""
    print_info "Restart application:"
    echo "  sudo su - ${APP_USER} -c 'pm2 restart salfanet-frontend'"
    echo "  sudo su - ${APP_USER} -c 'pm2 restart salfanet-backend'"
    echo "  sudo su - ${APP_USER} -c 'pm2 restart all'"
    
    return 0
}

# Main execution if run directly
if [ "${BASH_SOURCE[0]}" -ef "$0" ]; then
    check_root
    check_directory
    
    install_pm2_and_build
fi
